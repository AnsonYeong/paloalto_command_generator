import { spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { request } from 'node:http'
import { createConnection } from 'node:net'
import assert from 'node:assert/strict'

const root = process.cwd()
const qa = resolve(root, '.qa')
await mkdir(qa, { recursive: true })
const appFolder = await mkdtemp(resolve(qa, 'windows-app-'))
const executable = resolve(appFolder, 'PaloAltoCommandGenerator.exe')
await copyFile(resolve(root, '.desktop-build/PaloAltoCommandGenerator.exe'), executable)
assert.deepEqual(await readdir(appFolder), ['PaloAltoCommandGenerator.exe'])
const bytes = await readFile(executable)
assert.equal(bytes.subarray(0, 2).toString(), 'MZ', 'real Windows executable')

const pause = ms => new Promise(r => setTimeout(r, ms))
function launch(args) {
  const child = spawn(executable, args, { cwd: appFolder, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child.on('error', e => { console.error(e); process.exitCode = 1 })
  return child
}
function ended(child, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) { resolve(child.exitCode); return }
    const timer = setTimeout(() => { child.kill(); reject(new Error('Child process did not exit in time')) }, timeout)
    child.once('exit', code => { clearTimeout(timer); resolve(code) })
    child.once('error', error => { clearTimeout(timer); reject(error) })
  })
}
const base = 'http://127.0.0.1:52574'
const server = launch(['--headless', '--port', '52574'])
let serverError = ''
server.stderr.on('data', d => { serverError += d })
try {
  let ready = false
  for (let i = 0; i < 60; i++) {
    try { ready = await (await fetch(base + '/__pan_builder_health')).text() === 'PANBuilder.Desktop.1'; if (ready) break } catch {}
    if (server.exitCode !== null) throw new Error(`EXE exited: ${serverError}`)
    await pause(100)
  }
  assert.ok(ready, 'standalone EXE starts without a project directory')
  const index = await fetch(base)
  assert.equal(index.status, 200)
  assert.match(index.headers.get('content-type'), /text\/html/)
  assert.match(index.headers.get('content-security-policy'), /frame-ancestors 'none'/)
  const html = await index.text()
  assert.match(html, /<div id="root">/)
  for (const [, path] of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)) assert.equal((await fetch(base + path)).status, 200, path)
  assert.match((await fetch(base + '/fonts/Oswald-Variable.ttf')).headers.get('content-type'), /font\/ttf/)
  assert.match(await (await fetch(base + '/THIRD-PARTY-NOTICES.txt')).text(), /Apache License/)
  const head = await fetch(base, { method: 'HEAD' })
  assert.equal(await head.text(), '')
  assert.ok(Number(head.headers.get('content-length')) > 0)
  assert.equal((await fetch(base, { method: 'POST', body: 'ignored' })).status, 405)
  for (const path of ['/src/CommandBuilder.tsx', '/package.json', '/.git/config', '/%2e%2e/desktop/Launcher.cs', '/missing.js']) assert.equal((await fetch(base + path)).status, 404, path)
  const invalidHost = await new Promise((resolve, reject) => {
    const req = request(base, { headers: { Host: 'untrusted.example:52574' } }, res => { res.resume(); resolve(res.statusCode) })
    req.on('error', reject); req.end()
  })
  assert.equal(invalidHost, 403)
  const largeHeader = await new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: 52574 }, () => socket.write('GET / HTTP/1.1\r\nHost: 127.0.0.1:52574\r\nX-Test: ' + 'x'.repeat(17000) + '\r\n\r\n'))
    socket.once('data', data => { resolve(data.toString()); socket.destroy() })
    socket.once('error', reject)
  })
  assert.match(largeHeader, /431 Request Header Fields Too Large/)
  assert.equal(await ended(launch(['--headless', '--port', '52574'])), 0, 'a second launch reuses the running instance')
  assert.equal(await ended(launch(['--headless', '--port', '1'])), 1, 'invalid ports fail')
  console.log('Windows EXE checks passed: standalone resources, font, licenses, MIME types, HEAD, host restriction, blocked methods, path isolation, header limits and second launch.')
} finally {
  server.kill()
  await ended(server)
}

let stopped = false
for (let i = 0; i < 20; i++) {
  try { await fetch(base) } catch { stopped = true; break }
  await pause(100)
}
assert.ok(stopped, 'closing the process stops the local listener')

// Reuse all application workflows, but serve them from the copied EXE with DNS blocked.
const browserCheck = spawn(process.execPath, ['scripts/browser-smoke.mjs'], {
  cwd: root, env: { ...process.env, PAN_BUILDER_EXE: executable }, windowsHide: true, stdio: 'inherit',
})
assert.equal(await ended(browserCheck, 120000), 0, 'packaged browser workflows pass offline')
console.log('Windows application payload verified from ' + appFolder)
