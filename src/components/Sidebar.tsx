import { useEffect, useRef, useState } from 'react'
import type { Workspace } from '../lib/generator'
import { tabInfo } from './ObjectEditor'
import type { Tab } from './ObjectEditor'
import { Icon } from './ui'
import './Sidebar.css'

interface SidebarProps {
  workspace: Workspace
  tab: Tab
  collapsed: boolean
  guideOpen: boolean
  onCollapse: (collapsed: boolean) => void
  onNavigate: (tab: Tab) => void
  onEdit: (tab: Tab, id: string) => void
  onImport: () => void
  onExport: () => void
  onGuide: () => void
}

export function Sidebar({ workspace, tab, collapsed, guideOpen, onCollapse, onNavigate, onEdit, onImport, onExport, onGuide }: SidebarProps) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const search = query.trim().toLowerCase()
  const visibleTabs = tabInfo.filter(item => `${item.title} ${item.label}`.toLowerCase().includes(search))
  const results = search ? tabInfo.flatMap(info => workspace[info.key]
    .filter(item => `${item.name} ${'value' in item ? item.value : 'ports' in item ? `${item.protocol} ${item.ports}` : ''}`.toLowerCase().includes(search))
    .map(item => ({ ...info, id: item.id, name: item.name }))) : []

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onCollapse(false)
        requestAnimationFrame(() => searchRef.current?.focus())
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [onCollapse])

  function collapse() {
    onCollapse(true)
    requestAnimationFrame(() => toggleRef.current?.focus())
  }

  return <aside className={`workspace-sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="Workspace sidebar">
    <div className="sidebar-rail">
      <a className="rail-brand" href="#main" aria-label="PAN builder home" title="PAN / builder"><Icon name="panels" size={25} /></a>
      <nav className="rail-navigation" aria-label="Quick navigation">
        {tabInfo.map(item => <button key={item.key} className={`rail-button ${tab === item.key ? 'active' : ''}`} onClick={() => onNavigate(item.key)} aria-label={item.title} aria-current={tab === item.key ? 'page' : undefined} title={item.title}><Icon name={item.icon} size={19} /></button>)}
      </nav>
      <div className="rail-bottom">
        <button className={`rail-button ${guideOpen ? 'active' : ''}`} onClick={onGuide} aria-label="Quick guide" aria-expanded={guideOpen} title="Quick guide"><Icon name="book" size={19} /></button>
        <button ref={toggleRef} className="rail-button rail-toggle" onClick={() => onCollapse(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="sidebar-panel" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={19} /></button>
        <span className="rail-local" title="Local workspace"><Icon name="lock" size={17} /><span className="visually-hidden">Local workspace</span></span>
      </div>
    </div>

    <div id="sidebar-panel" className="sidebar-panel" hidden={collapsed}>
      <div className="sidebar-panel-heading"><h2>Command builder</h2><button className="sidebar-collapse" onClick={collapse} aria-label="Collapse navigation panel" aria-expanded={!collapsed} aria-controls="sidebar-panel" title="Collapse sidebar"><Icon name="chevron-left" size={17} /></button></div>
      <div className="sidebar-search"><Icon name="search" size={16} /><input ref={searchRef} aria-label="Search objects and navigation" placeholder="Search objects, tools..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); searchRef.current?.blur() } }} />{query ? <button onClick={() => { setQuery(''); searchRef.current?.focus() }} aria-label="Clear sidebar search"><Icon name="close" size={14} /></button> : <kbd title="Ctrl or Command + K">⌘ K</kbd>}</div>
      <div className="sidebar-scroll">
        <nav aria-label="Object builder" className="sidebar-section">
          <h3>{search ? 'Tools' : 'Configuration'}</h3>
          {visibleTabs.map(item => <button key={item.key} data-tab={item.key} className={`sidebar-link ${tab === item.key ? 'active' : ''}`} onClick={() => onNavigate(item.key)} aria-current={tab === item.key ? 'page' : undefined}><Icon name={item.icon} size={17} /><span>{item.title}</span><span className="sidebar-count">{workspace[item.key].length}</span></button>)}
          {search && !visibleTabs.length && <p className="sidebar-empty">No matching tools.</p>}
        </nav>
        {search ? <section className="sidebar-section" aria-label="Search results"><h3>Objects <span>{results.length}</span></h3>{results.map(item => <button key={`${item.key}-${item.id}`} className="sidebar-link sidebar-result" onClick={() => { onEdit(item.key, item.id); setQuery('') }}><Icon name={item.icon} size={17} /><span><strong>{item.name}</strong><small>{item.title}</small></span></button>)}{!results.length && <p className="sidebar-empty">No matching objects.</p>}</section> : <>
          <section className="sidebar-section" aria-label="Workspace files"><h3>Workspace</h3><button className="sidebar-link" onClick={onImport}><Icon name="upload" size={17} /><span>Import workspace</span></button><button className="sidebar-link" onClick={onExport}><Icon name="download" size={17} /><span>Export workspace</span></button></section>
          <section className="sidebar-section" aria-label="Help and resources"><h3>Help & resources</h3><button className={`sidebar-link ${guideOpen ? 'active' : ''}`} onClick={onGuide} aria-expanded={guideOpen}><Icon name="book" size={17} /><span>Quick guide</span></button><a className="sidebar-link" href="https://docs.paloaltonetworks.com/ngfw/pan-os-cli-quick-start/cli-command-hierarchy/pan-os-11-2-configure-cli-command-hierarchy" target="_blank" rel="noreferrer"><Icon name="terminal" size={17} /><span>PAN-OS CLI reference</span></a></section>
        </>}
      </div>
      <div className="sidebar-panel-footer"><span className="workspace-monogram">PA</span><div><strong>Local workspace</strong><small>Saved in this browser</small></div><span className="sidebar-local-icon"><Icon name="lock" size={15} /></span></div>
    </div>
  </aside>
}
