import test from 'node:test'
import assert from 'node:assert/strict'
import { utils, write } from 'xlsx'
import { matrixFixture } from './fixtures/matrix-fixture.mjs'
import { readMatrixWorkbook } from '../src/lib/matrixWorkbook.ts'
import { defaultMatrixOptions as defaults, detectMatrixLayout, emptyFields, extractMatrixRows, matchesKeywords, matrixHeaders, parseMatrixAddresses, parseMatrixRow, parseMatrixServices, planMatrixImport, suggestRole } from '../src/lib/matrix.ts'
import { emptyWorkspace, generateCommands, validateWorkspace } from '../src/lib/generator.ts'

const buffer = data => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
const fixture = () => readMatrixWorkbook(buffer(matrixFixture()), 'example.xlsx')
const makeRow = (fields, id = 'Sample:2', options = defaults) => parseMatrixRow(id, 'Sample', 2, { ...emptyFields(), ...fields }, '', '', options)

test('XLSX detects offset, two-tier merged headers and ignores NAT columns', () => {
  const book = fixture()
  assert.equal(book.sheets.length, 3)
  const sheet = book.sheets[1], config = detectMatrixLayout(sheet)
  assert.equal(config.headerRow, 13)
  assert.equal(config.headerDepth, 2)
  assert.deepEqual(config.mapping, ['ignore', 'source', 'ignore', 'ignore', 'sourceName', 'destination', 'ignore', 'destinationName', 'ports', 'description'])
  assert.match(matrixHeaders(sheet, config)[4], /Source Environment.*Src Description/)
  const rows = extractMatrixRows(sheet, config, defaults)
  assert.deepEqual(rows.map(r => r.row), [17, 18, 19, 20, 21])
  assert.equal(rows.filter(r => !r.issues.length).length, 2)
  assert.equal(rows[0].context, 'Production web')
  assert.equal(rows[0].sources.length, 2)
  assert.ok(!JSON.stringify(rows.map(r => r.sources)).includes('203.0.113.99'))
  assert.deepEqual(detectMatrixLayout(book.sheets[2]).mapping, ['source', 'destination', 'protocol', 'ports', 'description'])
  assert.equal(extractMatrixRows(book.sheets[2], detectMatrixLayout(book.sheets[2]), defaults)[0].services[0].protocol, 'udp')
})

test('header aliases allow reordered columns and multiple port columns', () => {
  assert.equal(suggestRole('Destination IP Address'), 'destination')
  assert.equal(suggestRole('Source NAT IP'), 'ignore')
  assert.equal(suggestRole('Source port'), 'sourcePorts')
  const sheet = { name: 'Alternate', merges: [], formulaCount: 0, hidden: false, rows: [
    ['UDP port', 'Source Address', 'TCP port', 'Target'], ['53', '192.0.2.1', '443', '198.51.100.1'],
  ] }
  const row = extractMatrixRows(sheet, detectMatrixLayout(sheet), defaults)[0]
  assert.deepEqual(row.services.map(s => `${s.protocol}:${s.ports}`), ['udp:53', 'tcp:443'])
  assert.deepEqual(row.issues, [])
  sheet.rows[0][0] = 'TCP/UDP'
  assert.equal(extractMatrixRows(sheet, detectMatrixLayout(sheet), defaults)[0].services.length, 3)
})

test('merged data carries only actual vertical merges and leaves other blank cells for review', () => {
  const sheet = { name: 'Merged', formulaCount: 0, hidden: false, merges: [{ startRow: 1, endRow: 2, startColumn: 0, endColumn: 0 }], rows: [
    ['Source', 'Destination', 'Service'], ['192.0.2.1', '198.51.100.1', 'TCP 443'], ['', '198.51.100.2', 'UDP 53'], ['', '198.51.100.3', 'TCP 22'],
  ] }
  const rows = extractMatrixRows(sheet, detectMatrixLayout(sheet), defaults)
  assert.equal(rows[1].sources[0].value, '192.0.2.1/32')
  assert.equal(rows[2].sources.length, 0)
  assert.match(rows[2].issues.join(), /Source address is blank/)
})

test('addresses support lists, ranges, labels, IPv6, CIDR, FQDN and dotted masks', () => {
  const parsed = parseMatrixAddresses('Site A:\n192.0.2.10;192.0.2.11, 198.51.100.1 - 198.51.100.9\n2001:db8::1\n203.0.113.0 255.255.255.0\nAPI.example.com\n192.0.2.10/32')
  assert.deepEqual(parsed.issues, [])
  assert.deepEqual(parsed.values.map(v => v.value), ['192.0.2.10/32', '192.0.2.11/32', '198.51.100.1-198.51.100.9', '2001:db8::1/128', '203.0.113.0/24', 'api.example.com'])
  for (const bad of ['Admin VDI', 'any', '999.0.0.1', '192.0.2.0/255.0.255.0', '198.51.100.9-198.51.100.1', '192.0.2.1\ncommit']) assert.ok(parseMatrixAddresses(bad).issues.length, bad)
  assert.ok(makeRow({ source: 'DC1:' }).issues.length)
})

test('services parse mixed notation, dual protocols, separate protocol and source ports', () => {
  const parsed = parseMatrixServices('TCP/UDP : 389\nTCP : 636\nUDP (123)\nTCP (22, 2222, 9440); 443/tcp; TCP_8080\nTCP 8000 - 8100')
  assert.deepEqual(parsed.issues, [])
  assert.deepEqual(parsed.values.map(s => `${s.protocol}:${s.ports}`), ['tcp:389', 'udp:389', 'tcp:636', 'udp:123', 'tcp:22', 'tcp:2222', 'tcp:9440', 'tcp:443', 'tcp:8080', 'tcp:8000-8100'])
  assert.deepEqual(parseMatrixServices('53', '17', '1024-65535').values, [{ protocol: 'udp', ports: '53', sourcePorts: '1024-65535' }])
  assert.deepEqual(parseMatrixServices('53', 'TCP/UDP').values.map(s => s.protocol), ['tcp', 'udp'])
  assert.equal(parseMatrixServices('587', '', '', 'tcp').values[0].protocol, 'tcp')
})

test('ambiguous ports, protocol conflicts and unsupported protocols are never guessed', () => {
  for (const input of ['443', 'https', 'TCP : 139udp_88', 'TCP 65536', 'TCP 9000-8000', 'TCP 443 && commit']) {
    const parsed = parseMatrixServices(input)
    assert.ok(parsed.issues.length, input); assert.equal(parsed.values.length, 0, input)
  }
  assert.equal(parseMatrixServices('TCP 443', 'UDP').values.length, 0)
  const mixed = parseMatrixServices('TCP (22, 2222, 9440), ICMP 0')
  assert.equal(mixed.values.length, 3)
  assert.match(mixed.issues.join(), /Unsupported/)
  assert.equal(parseMatrixServices('TCP 443', '', 'invalid').values.length, 0)
})

test('keywords match entire rows, section context and sheet names using any or all mode', () => {
  const s = fixture().sheets[1], rows = extractMatrixRows(s, detectMatrixLayout(s), defaults)
  assert.equal(rows.filter(r => matchesKeywords(r, 'HTTPS')).length, 1)
  assert.equal(rows.filter(r => matchesKeywords(r, 'dns, mail')).length, 2)
  assert.equal(rows.filter(r => matchesKeywords(r, 'production, traffic, dns', true)).length, 1)
  assert.equal(rows.filter(r => matchesKeywords(r, 'missing, dns', true)).length, 0)
  assert.equal(rows.filter(r => matchesKeywords(r, '')).length, 5)
})

test('row corrections and object extraction toggles affect validation and preview', () => {
  const s = fixture().sheets[1], c = detectMatrixLayout(s)
  const rows = extractMatrixRows(s, c, defaults)
  const edits = { [rows[3].id]: { ...rows[3].fields, ports: 'TCP 587' } }
  const revised = extractMatrixRows(s, c, defaults, edits)
  assert.deepEqual(revised[3].issues, [])
  assert.equal(revised[3].row, 20)
  assert.equal(extractMatrixRows(s, c, { ...defaults, services: false }).filter(r => r.issues.length).length, 0)
  assert.equal(s.rows[19][8], '587', 'editing must leave source data untouched')
})

test('planning deduplicates values, reuses existing objects, resolves name collisions and validates commands', () => {
  const workspace = emptyWorkspace()
  workspace.addresses = [{ id: 'original', name: 'Existing', type: 'ip-netmask', value: '192.0.2.1/32', description: 'Keep' }, { id: 'collision', name: 'HOST_198.51.100.1', type: 'ip-netmask', value: '203.0.113.1/32', description: '' }]
  workspace.services = [{ id: 'https', name: 'HTTPS', protocol: 'tcp', ports: '443', sourcePorts: '', description: 'Keep' }]
  const row = makeRow({ source: '192.0.2.1\n192.0.2.2', destination: '198.51.100.1', ports: 'TCP 443\nUDP 53', description: 'Example "remark"' })
  const plan = planMatrixImport([row, { ...row, id: 'Sample:3' }], workspace, defaults)
  assert.equal(plan.addresses.length, 2)
  assert.equal(plan.services.length, 1)
  assert.equal(plan.items.filter(i => i.existing).length, 2)
  assert.equal(plan.addresses[1].name, 'HOST_198.51.100.1-2')
  assert.deepEqual(plan.items[0].rows, ['Sample:2', 'Sample:3'])
  assert.equal(workspace.addresses.length, 2)
  const next = { ...workspace, addresses: [...workspace.addresses, ...plan.addresses], services: [...workspace.services, ...plan.services] }
  assert.deepEqual(validateWorkspace(next), [])
  assert.ok(generateCommands(next).lines.some(l => l.text.includes('service UDP-53 protocol udp port 53')))
  assert.equal(planMatrixImport([row], next, defaults).addresses.length, 0)
  assert.equal(planMatrixImport([row], next, defaults).services.length, 0)
})

test('mapped names are sanitized and deterministic; IPv6 networks keep their prefix in names', () => {
  const options = { ...defaults, useNames: true }
  const row = makeRow({ source: '192.0.2.1\n192.0.2.2', sourceName: 'Frontend "Production"', ports: 'TCP 443', serviceName: 'Web / TLS', description: 'text\ncommit' })
  const plan = planMatrixImport([row], emptyWorkspace(), options)
  assert.deepEqual(plan.addresses.map(a => a.name), ['Frontend-Production-1', 'Frontend-Production-2'])
  assert.equal(plan.services[0].name, 'Web-TLS-TCP-443')
  assert.deepEqual(validateWorkspace({ ...emptyWorkspace(), addresses: plan.addresses, services: plan.services }), [])
  const ipv6 = planMatrixImport([makeRow({ source: '2001:db8::/32' })], emptyWorkspace(), defaults)
  assert.match(ipv6.addresses[0].name, /NET_.*32/)
  const network = planMatrixImport([makeRow({ source: '10.202.52.0/23' })], emptyWorkspace(), defaults)
  assert.equal(network.addresses[0].name, 'NET_10.202.52.0_23')
  assert.ok(generateCommands({ ...emptyWorkspace(), addresses: network.addresses }).lines.some(l => l.text === 'set address NET_10.202.52.0_23 ip-netmask 10.202.52.0/23'))
  const named = planMatrixImport([makeRow({ source: '192.0.2.1', sourceName: 'Office.Network' })], emptyWorkspace(), options)
  assert.equal(named.addresses[0].name, 'Office.Network')
})

test('CSV quoting, semicolon delimiters and legacy XLS are read locally', () => {
  const csv = new TextEncoder().encode('Src IP Addr;Dest IP Addr;Ports / Services\r\n"192.0.2.1\n192.0.2.2";198.51.100.1;"TCP 80,443"')
  const sheet = readMatrixWorkbook(buffer(csv), 'matrix.csv').sheets[0]
  const row = extractMatrixRows(sheet, detectMatrixLayout(sheet), defaults)[0]
  assert.equal(row.sources.length, 2)
  assert.equal(row.services.length, 2)
  const xls = readMatrixWorkbook(buffer(matrixFixture('biff8')), 'matrix.xls')
  assert.equal(xls.sheets.length, 3)
})

test('formula cells use cached values only and never execute workbook instructions', () => {
  const book = utils.book_new(), sheet = utils.aoa_to_sheet([['Source', 'Service'], ['192.0.2.1', 'TCP 443']])
  sheet.A2 = { t: 's', f: 'HYPERLINK("https://example.invalid","192.0.2.1")', v: '192.0.2.1' }
  sheet.A3 = { t: 'n', f: '1+1' }
  sheet['!ref'] = 'A1:B3'
  utils.book_append_sheet(book, sheet, 'Formula')
  const result = readMatrixWorkbook(buffer(write(book, { type: 'buffer', bookType: 'xlsx' })), 'formula.xlsx').sheets[0]
  assert.equal(result.formulaCount, 2)
  assert.equal(result.rows[1][0], '192.0.2.1')
  assert.match(result.rows[2][0], /Formula has no cached value/)
  assert.ok(extractMatrixRows(result, detectMatrixLayout(result), defaults)[1].issues.length)
})

test('empty, unsupported and oversized imports fail clearly', () => {
  assert.throws(() => readMatrixWorkbook(new ArrayBuffer(0), 'matrix.xlsx'), /empty/)
  assert.throws(() => readMatrixWorkbook(new ArrayBuffer(1), 'matrix.pdf'), /Excel/)
  assert.throws(() => readMatrixWorkbook(new ArrayBuffer(21 * 1024 * 1024), 'matrix.csv'), /20 MB/)
})
