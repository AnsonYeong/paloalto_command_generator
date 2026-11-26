import { useEffect, useRef, useState } from 'react'
import { emptyWorkspace, exampleWorkspace, generateCommands, readWorkspace } from './lib/generator'
import type { Scope, Workspace } from './lib/generator'
import { ObjectEditor, tabInfo } from './components/ObjectEditor'
import type { Tab } from './components/ObjectEditor'
import { Field, Icon } from './components/ui'
import { Sidebar } from './components/Sidebar'
import { ThemeSelector } from './components/ThemeSelector'
import { MatrixImporter } from './components/MatrixImporter'
import './App.css'
import './theme.css'

const STORAGE_KEY = 'pan-command-builder-v1'
function loadInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return { workspace: saved ? readWorkspace(JSON.parse(saved)) : emptyWorkspace(), error: '' }
  } catch { return { workspace: emptyWorkspace(), error: 'The saved workspace could not be loaded. Import a backup or start a new workspace.' } }
}
function downloadFile(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function CommandBuilder() {
  const [initial] = useState(loadInitial)
  const [workspace, setWorkspace] = useState(initial.workspace)
  const [tab, setTab] = useState<Tab>('addresses')
  const [notice, setNotice] = useState(initial.error)
  const [storageError, setStorageError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [undo, setUndo] = useState<Workspace | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editorVersion, setEditorVersion] = useState(0)
  const [copied, setCopied] = useState(false)
  const [guide, setGuide] = useState(false)
  const [matrixOpen, setMatrixOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [pending, setPending] = useState<{ workspace: Workspace; title: string } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const builderRef = useRef<HTMLDivElement>(null)
  const outputRef = useRef<HTMLPreElement>(null)
  const generated = generateCommands(workspace)
  const commandText = generated.lines.map(l => l.text).join('\n')
  const objectCount = workspace.addresses.length + workspace.services.length + workspace.groups.length
  const info = tabInfo.find(t => t.key === tab)!
  const scopeLabels: Record<Scope, string> = { firewall: 'Firewall', vsys: 'Virtual system', shared: 'Shared', 'device-group': 'Panorama' }

  useEffect(() => {
    if (!dirty) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace)); setStorageError('') }
    catch { setStorageError('Browser storage is unavailable. Export your workspace to keep a copy.') }
  }, [workspace, dirty])
  useEffect(() => { if (pending) dialogRef.current?.showModal(); else dialogRef.current?.close() }, [pending])
  useEffect(() => { setCopied(false) }, [commandText])
  useEffect(() => { if (copied) { const timer = setTimeout(() => setCopied(false), 2500); return () => clearTimeout(timer) } }, [copied])
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 760px)')
    const resize = (event: MediaQueryListEvent) => setSidebarCollapsed(event.matches)
    mobile.addEventListener('change', resize)
    return () => mobile.removeEventListener('change', resize)
  }, [])

  function update(next: Workspace, message = '', reversible = false) {
    setUndo(reversible ? workspace : null); setWorkspace(next); setDirty(true); setNotice(message)
  }
  function resetEditor() { setEditing(null); setEditorVersion(v => v + 1) }
  function closeMobileSidebar() { if (window.matchMedia('(max-width: 760px)').matches) setSidebarCollapsed(true) }
  function switchTab(next: Tab) { setTab(next); resetEditor(); closeMobileSidebar() }
  function remove(kind: Tab, id: string) {
    const item = workspace[kind].find(o => o.id === id)!
    const next = { ...workspace, [kind]: workspace[kind].filter(o => o.id !== id) }
    if (kind !== 'groups') next.groups = next.groups.map(g => ({ ...g, members: g.members.filter(m => m !== id) }))
    update(next, `${item.name} removed${kind !== 'groups' ? ' from the workspace and its groups' : ''}.`, true)
    resetEditor()
  }
  function edit(id: string, nextTab: Tab = tab) {
    setTab(nextTab)
    closeMobileSidebar()
    setEditing(id); setEditorVersion(v => v + 1)
    requestAnimationFrame(() => {
      builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      builderRef.current?.querySelector<HTMLInputElement>('form input')?.focus({ preventScroll: true })
    })
  }
  function replace(next: Workspace, title: string) {
    if (objectCount) { setPending({ workspace: next, title }); return }
    update(next, `${title} complete.`, true); resetEditor()
  }
  async function importWorkspace(file: File | undefined) {
    if (!file) return
    try {
      if (file.size > 2_000_000) throw new Error('Choose a workspace smaller than 2 MB.')
      replace(readWorkspace(JSON.parse(await file.text())), 'Import workspace')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The workspace could not be imported.') }
    if (importRef.current) importRef.current.value = ''
  }
  async function copyCommands() {
    try { await navigator.clipboard.writeText(commandText); setCopied(true) }
    catch {
      const range = document.createRange()
      if (outputRef.current) { range.selectNodeContents(outputRef.current); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range) }
      setNotice('Clipboard access is unavailable. The commands are selected; press Ctrl+C or use Download .txt.')
    }
  }

  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <Sidebar workspace={workspace} tab={tab} collapsed={sidebarCollapsed} guideOpen={guide}
      onCollapse={setSidebarCollapsed} onNavigate={switchTab} onEdit={(nextTab, id) => edit(id, nextTab)}
      onImport={() => importRef.current?.click()}
      onImportMatrix={() => { setMatrixOpen(true); closeMobileSidebar() }}
      onExport={() => downloadFile(JSON.stringify(workspace, null, 2), 'pan-workspace.json', 'application/json')}
      onGuide={() => { setGuide(open => !open); closeMobileSidebar() }} />
    <main id="main">
      <header className="topbar">
        <div className="breadcrumb">Workspace <span>/</span> <strong>Command builder</strong></div>
        <div className="topbar-actions">
          <div className={`save-state ${storageError || initial.error && !dirty ? 'has-error' : ''}`}><Icon name={storageError || initial.error && !dirty ? 'close' : 'check'} size={15} />{storageError || initial.error && !dirty ? 'Not saved' : 'Saved locally'}</div>
          <ThemeSelector />
        </div>
      </header>
      <div className="main-content">
        <section className="page-heading"><div><div className="eyebrow">PALO ALTO NETWORKS · CLI TOOL</div><h1>Build commands. Save time.</h1><p>Add your objects, organize your groups, and copy the configuration.</p></div><div className="page-heading-actions"><button className="button primary" onClick={() => setMatrixOpen(true)}><Icon name="upload" />Import matrix</button><button className="button secondary example-button" onClick={() => replace(exampleWorkspace(), 'Load example')}><Icon name="spark" />Load example</button></div></section>
        {(notice || storageError) && <div className={`notice ${storageError ? 'notice-error' : ''}`} role="status"><span>{storageError || notice}</span>{undo && <button onClick={() => { update(undo, 'Change undone.'); resetEditor() }}>Undo</button>}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')} disabled={!!storageError}><Icon name="close" size={16} /></button></div>}
        {guide && <section className="guide"><div className="section-heading"><h2>From objects to CLI in three steps</h2><button className="icon-button" aria-label="Close quick guide" onClick={() => setGuide(false)}><Icon name="close" /></button></div><ol><li><strong>Add your objects.</strong> Enter IPs or paste a list. Add TCP/UDP services by destination port.</li><li><strong>Choose scope and groups.</strong> Select firewall, virtual system, shared, or a Panorama device group. Groups reference objects in this workspace.</li><li><strong>Review and paste.</strong> Copy commands into the appropriate CLI context. Review candidate changes before committing. Panorama changes also need a push to managed firewalls.</li></ol><p>Existing objects with the same name may be updated. Existing group members are retained. Security policies are configured separately.</p></section>}
        <section className="target-bar" aria-label="Configuration target"><div className="target-title"><Icon name="shield" size={20} /><div><strong>Configuration target</strong><small>Where will these objects live?</small></div></div><Field label="Scope"><select value={workspace.scope} onChange={e => update({ ...workspace, scope: e.target.value as Scope, scopeName: e.target.value === 'vsys' ? 'vsys1' : '' })}><option value="firewall">Firewall · current vsys</option><option value="vsys">Firewall · specific vsys</option><option value="shared">Shared objects</option><option value="device-group">Panorama · device group</option></select></Field>{(workspace.scope === 'vsys' || workspace.scope === 'device-group') && <Field label={workspace.scope === 'vsys' ? 'Virtual system' : 'Device group'}><input value={workspace.scopeName} placeholder={workspace.scope === 'vsys' ? 'vsys1' : 'Branch-Firewalls'} onChange={e => update({ ...workspace, scopeName: e.target.value })} /></Field>}</section>

        <div className="builder-layout">
          <div className="editor-column">
            <div className="summary-strip" aria-label="Workspace totals">{tabInfo.map(item => <button key={item.key} className={`summary-item ${tab === item.key ? 'selected' : ''}`} onClick={() => switchTab(item.key)}><Icon name={item.icon} /><strong>{workspace[item.key].length.toString().padStart(2, '0')}</strong><span>{item.label}</span></button>)}</div>
            <div ref={builderRef} className="editor-anchor"><ObjectEditor key={`${tab}-${editorVersion}`} tab={tab} workspace={workspace} editing={editing} update={update} done={resetEditor} switchTab={switchTab} /></div>
            <section className="panel inventory"><div className="inventory-heading"><h2>{info.title} <span className="count-pill">{workspace[tab].length}</span></h2><span>IN THIS WORKSPACE</span></div>{workspace[tab].length ? <div className="object-list">{workspace[tab].map(item => {
              const issue = generated.issues.find(i => i.id === item.id)
              return <div className={`object-item ${editing === item.id ? 'is-editing' : ''} ${issue ? 'invalid-item' : ''}`} key={item.id}><span className={`object-symbol ${tab}`}><Icon name={info.icon} /></span><div className="object-info"><strong>{item.name}</strong><div>{'value' in item ? <><code>{item.value}</code><span className="type-tag">{item.type === 'ip-netmask' ? 'IP / NETMASK' : item.type === 'ip-range' ? 'IP RANGE' : 'FQDN'}</span></> : 'ports' in item ? <><code>{item.ports}</code><span className="type-tag">{item.protocol.toUpperCase()}</span>{item.sourcePorts && <small>Source: {item.sourcePorts}</small>}</> : <><span className="type-tag">{item.kind.toUpperCase()} GROUP</span><span>{item.members.length} members</span></>}</div>{'description' in item && item.description && <small>{item.description}</small>}{'members' in item && <small>{item.members.map(id => [...workspace.addresses, ...workspace.services].find(o => o.id === id)?.name || 'Missing object').join(', ')}</small>}{issue && <small className="inline-error">{issue.message}</small>}</div><div className="item-actions"><button className="icon-button" onClick={() => edit(item.id)} aria-label={`Edit ${item.name}`} title="Edit"><Icon name="edit" size={16} /></button><button className="icon-button danger" onClick={() => remove(tab, item.id)} aria-label={`Delete ${item.name}`} title="Delete"><Icon name="trash" size={16} /></button></div></div>
            })}</div> : <div className="empty-inventory"><div className="empty-object-icon"><Icon name={info.icon} size={26} /><span><Icon name="plus" size={10} /></span></div><h3>{tab === 'groups' ? 'A place for related objects' : `Your ${info.label.toLowerCase()} go here`}</h3><p>{tab === 'groups' ? 'Select objects above to create your first group.' : 'Add your first object above, or load an example to explore.'}</p></div>}</section>
            <div className="workspace-actions"><input ref={importRef} type="file" accept=".json,application/json" hidden onChange={e => void importWorkspace(e.target.files?.[0])} /><button onClick={() => importRef.current?.click()}><Icon name="upload" size={15} />Import workspace</button><button onClick={() => downloadFile(JSON.stringify(workspace, null, 2), 'pan-workspace.json', 'application/json')}><Icon name="download" size={15} />Export workspace</button><button className="reset-button" disabled={!objectCount} onClick={() => replace(emptyWorkspace(), 'Clear workspace')}><Icon name="trash" size={15} />Clear</button></div>
          </div>

          <aside className="output-column" aria-label="Generated commands"><section className="command-panel"><div className="command-heading"><div><Icon name="terminal" size={20} /><h2>Command preview</h2></div><span className="live-label"><span />LIVE</span></div><div className="command-meta"><span>pan-os-config.txt</span><span>{generated.lines.length} lines</span></div>{generated.issues.length ? <div className="output-errors" role="alert"><strong>Resolve these items to generate commands</strong><ul>{generated.issues.map((issue, i) => <li key={`${issue.id}-${i}`}>{issue.message}</li>)}</ul></div> : generated.lines.length ? <pre className="command-code" ref={outputRef} tabIndex={0} aria-label="Generated Palo Alto CLI commands">{generated.lines.map((line, index) => <span className={`code-line ${index > 0 && generated.lines[index - 1].section !== line.section ? 'new-section' : ''}`} key={index}><span className="line-number" aria-hidden="true" data-line={index + 1} /><code><span className="command-keyword">{line.text.split(' ')[0]}</span>{line.text.slice(line.text.indexOf(' ') > -1 ? line.text.indexOf(' ') : line.text.length)}</code>{'\n'}</span>)}</pre> : <div className="empty-preview"><div className="terminal-art"><span /><span /><span /><div><Icon name="terminal" size={31} /><i /></div></div><h3>Your configuration starts here.</h3><p>Add an address or service to see<br />your CLI commands take shape.</p><div className="placeholder-code"><span>set</span> address <i>your-object</i> ...</div></div>}<div className="command-status"><span className={generated.issues.length ? 'status-invalid' : generated.lines.length ? 'status-valid' : ''}><Icon name={generated.issues.length ? 'close' : generated.lines.length ? 'check' : 'terminal'} size={15} />{generated.issues.length ? 'Needs attention' : generated.lines.length ? 'Ready to copy' : 'Waiting for objects'}</span><span>{scopeLabels[workspace.scope]}</span></div><div className="output-buttons"><button className="button copy-button" onClick={() => void copyCommands()} disabled={!commandText}><Icon name={copied ? 'check' : 'copy'} />{copied ? 'Copied!' : 'Copy commands'}</button><button className="button download-button" onClick={() => downloadFile(commandText + '\n', 'pan-os-config.txt', 'text/plain')} disabled={!commandText} aria-label="Download commands as text" title="Download .txt"><Icon name="download" /></button></div></section>
          <section className="output-options"><h3>Command options</h3><label className="option-row"><span><strong>Enter configuration mode</strong><small>Start with <code>configure</code></small></span><input className="toggle" type="checkbox" checked={workspace.includeConfigure} onChange={e => update({ ...workspace, includeConfigure: e.target.checked })} /></label><label className="option-row"><span><strong>Include commit</strong><small>Apply candidate configuration at the end</small></span><input className="toggle" type="checkbox" checked={workspace.includeCommit} onChange={e => update({ ...workspace, includeCommit: e.target.checked })} /></label>{workspace.includeCommit && <p className="commit-note">The script will apply candidate changes, including other pending changes covered by the commit.</p>}</section><div className="review-note"><Icon name="shield" size={19} /><p><strong>A quick review goes a long way.</strong> Check the target and existing object names before pasting. {workspace.scope === 'device-group' || workspace.scope === 'shared' ? 'On Panorama, commit and then push to your firewalls.' : 'Commit on the firewall when you’re ready to apply your changes.'}</p></div></aside>
        </div>
        <footer className="page-footer"><span>Built for fewer keystrokes.</span><span>Local generation <span>·</span> No credentials required</span></footer>
      </div>
    </main>
    {matrixOpen && <MatrixImporter workspace={workspace} onClose={() => setMatrixOpen(false)} onImport={plan => {
      update({ ...workspace, addresses: [...workspace.addresses, ...plan.addresses], services: [...workspace.services, ...plan.services] }, `Imported ${plan.addresses.length} addresses and ${plan.services.length} services from the matrix. ${plan.items.filter(i => i.existing).length} existing objects reused.`, true)
      resetEditor(); setMatrixOpen(false)
    }} />}
    <dialog ref={dialogRef} onCancel={() => setPending(null)} className="confirm-dialog"><h2>{pending?.title}?</h2><p>This replaces the current workspace. You can export a backup first, or undo the replacement afterward.</p><div className="button-row"><button className="button secondary" onClick={() => setPending(null)}>Cancel</button><button className="button primary" onClick={() => { if (pending) { update(pending.workspace, `${pending.title} complete.`, true); resetEditor(); setPending(null) } }}>Continue</button></div></dialog>
  </div>
}
