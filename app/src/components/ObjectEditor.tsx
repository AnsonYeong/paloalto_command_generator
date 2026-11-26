import { useState } from 'react'
import type { FormEvent } from 'react'
import { addressError, nameError, newId, normalizeAddress, normalizePorts, parseBulkAddresses, portsError, suggestedName, validateWorkspace } from '../lib/generator'
import type { AddressObject, AddressType, ObjectGroup, ObjectKind, ServiceObject, Workspace } from '../lib/generator'
import { Field, FormError, Icon } from './ui'

export type Tab = 'addresses' | 'services' | 'groups'
export const tabInfo = [
  { key: 'addresses', icon: 'address', title: 'Address objects', label: 'Addresses' },
  { key: 'services', icon: 'service', title: 'Service objects', label: 'Services' },
  { key: 'groups', icon: 'group', title: 'Object groups', label: 'Groups' },
] as const
const blankAddress = (): AddressObject => ({ id: newId(), name: '', type: 'ip-netmask', value: '', description: '' })
const blankService = (): ServiceObject => ({ id: newId(), name: '', protocol: 'tcp', ports: '', sourcePorts: '', description: '' })
const blankGroup = (): ObjectGroup => ({ id: newId(), name: '', kind: 'address', members: [] })

export function ObjectEditor({ tab, workspace, editing, update, done, switchTab }: {
  tab: Tab; workspace: Workspace; editing: string | null;
  update: (next: Workspace, message?: string) => void; done: () => void; switchTab: (tab: Tab) => void
}) {
  const [address, setAddress] = useState(() => workspace.addresses.find(a => a.id === editing) ?? blankAddress())
  const [service, setService] = useState(() => workspace.services.find(s => s.id === editing) ?? blankService())
  const [group, setGroup] = useState(() => workspace.groups.find(g => g.id === editing) ?? blankGroup())
  const [error, setError] = useState('')
  const [bulk, setBulk] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkErrors, setBulkErrors] = useState<string[]>([])
  const info = tabInfo.find(t => t.key === tab)!
  const choices = group.kind === 'address' ? workspace.addresses : workspace.services

  function save(event: FormEvent) {
    event.preventDefault()
    let item: AddressObject | ServiceObject | ObjectGroup
    if (tab === 'addresses') {
      const value = address.value.trim()
      item = { ...address, name: address.name.trim() || suggestedName(address.type, value), value, description: address.description.trim() }
      const issue = nameError(item.name) || addressError(item.type, item.value)
      if (issue) { setError(issue); return }
      item.value = normalizeAddress(item.type, item.value)
    } else if (tab === 'services') {
      item = { ...service, name: service.name.trim() || `${service.protocol.toUpperCase()}-${service.ports.replace(/[^\d-]+/g, '-')}`.slice(0, 63), description: service.description.trim() }
      const issue = nameError(item.name) || portsError(item.ports) || portsError(item.sourcePorts, true)
      if (issue) { setError(issue); return }
      item.ports = normalizePorts(item.ports)
      item.sourcePorts = item.sourcePorts.trim() ? normalizePorts(item.sourcePorts) : ''
    } else item = { ...group, name: group.name.trim() }
    const kind = tab === 'addresses' ? 'address' : tab === 'services' ? 'service' : group.kind
    const peers = [...(kind === 'address' ? workspace.addresses : workspace.services), ...workspace.groups.filter(g => g.kind === kind)]
    if (peers.some(p => p.id !== editing && p.name === item.name)) { setError(`The ${kind} name "${item.name}" is already used.`); return }
    const next = { ...workspace, [tab]: editing ? workspace[tab].map(o => o.id === editing ? item : o) : [...workspace[tab], item] } as Workspace
    const issue = validateWorkspace(next).find(i => i.id === item.id)
    if (issue) { setError(issue.message); return }
    update(next, `${item.name} ${editing ? 'updated' : 'added'}.`)
    done()
  }
  function addBulk() {
    const result = parseBulkAddresses(bulkText)
    const used = new Set([...workspace.addresses.map(a => a.name), ...workspace.groups.filter(g => g.kind === 'address').map(g => g.name)])
    const errors = [...result.errors, ...result.addresses.filter(a => used.has(a.name)).map(a => `The name "${a.name}" is already used.`)]
    if (!bulkText.trim()) errors.push('Paste at least one address.')
    setBulkErrors(errors)
    if (errors.length) return
    update({ ...workspace, addresses: [...workspace.addresses, ...result.addresses] }, `Added ${result.addresses.length} address objects.`)
    done()
  }
  const footer = <div className="form-footer"><span>{tab === 'addresses' ? 'IPv4 and IPv6 supported' : tab === 'services' ? 'One protocol per service object' : `${group.members.length} members selected`}</span><div className="button-row">{editing && <button className="button text-button" type="button" onClick={done}>Cancel</button>}<button type="submit" className="button primary"><Icon name={editing ? 'check' : 'plus'} />{editing ? 'Save changes' : `Add ${info.icon}`}</button></div></div>

  return <section className="panel editor-panel">
    <div className="panel-heading"><div><h2>{editing ? 'Edit' : 'Add'} {tab === 'groups' ? 'object group' : `${info.icon} object`}</h2><p>{tab === 'addresses' ? 'Give an IP address or network a reusable name.' : tab === 'services' ? 'Define the protocol and ports your service uses.' : 'Bring related objects together for your policies.'}</p></div><span className="panel-icon"><Icon name={info.icon} size={21} /></span></div>
    {tab === 'addresses' && <div className="mode-tabs"><button className={!bulk ? 'selected' : ''} onClick={() => setBulk(false)}>Single object</button><button className={bulk ? 'selected' : ''} onClick={() => { setBulk(true); setBulkErrors([]) }} disabled={!!editing}><Icon name="upload" size={15} />Bulk paste</button></div>}
    {tab === 'services' && <div className="presets"><span>Presets</span>{([{ label: 'HTTPS', protocol: 'tcp', port: '443' }, { label: 'HTTP', protocol: 'tcp', port: '80' }, { label: 'SSH', protocol: 'tcp', port: '22' }, { label: 'DNS · UDP', protocol: 'udp', port: '53' }, { label: 'DNS · TCP', protocol: 'tcp', port: '53' }, { label: 'RDP', protocol: 'tcp', port: '3389' }] as const).map(p => <button key={p.label} onClick={() => { setService({ ...service, name: `${p.protocol.toUpperCase()}-${p.port}`, protocol: p.protocol, ports: p.port }); setError('') }}>{p.label}</button>)}</div>}
    {bulk ? <div className="object-form"><Field label="Paste your addresses" hint="One per line: IP alone, or name,IP. Tab-separated Excel columns also work."><textarea className="bulk-input mono" rows={8} value={bulkText} onChange={e => { setBulkText(e.target.value); setBulkErrors([]) }} placeholder={'192.168.10.10\nWEB-SERVER,192.168.10.11\nOFFICE-NET,10.20.0.0/24\nAPP-DNS,app.example.com'} /></Field>{bulkErrors.length > 0 && <div className="form-error" role="alert">{bulkErrors.map((e, i) => <p key={i}>{e}</p>)}<p>No addresses were added. Fix the entries and try again.</p></div>}<div className="form-footer"><span>IP-only entries get automatic names.</span><button className="button primary" onClick={addBulk}><Icon name="plus" />Add addresses</button></div></div>
    : <form className="object-form" onSubmit={save} noValidate>
      {tab === 'addresses' && <><div className="form-row"><Field label="Address type"><select value={address.type} onChange={e => setAddress({ ...address, type: e.target.value as AddressType })}><option value="ip-netmask">IP address / subnet</option><option value="ip-range">IP range</option><option value="fqdn">FQDN</option></select></Field><Field label={address.type === 'fqdn' ? 'Domain name' : address.type === 'ip-range' ? 'IP range' : 'IP address / CIDR'}><input className="mono" value={address.value} placeholder={address.type === 'fqdn' ? 'app.example.com' : address.type === 'ip-range' ? '10.0.0.10-10.0.0.20' : '192.168.10.10 or 10.0.0.0/24'} onChange={e => setAddress({ ...address, value: e.target.value })} spellCheck={false} /></Field></div><Field label="Object name" hint="Leave blank to generate a name from the address."><input value={address.name} placeholder={suggestedName(address.type, address.value) || 'e.g. WEB-SERVER-01'} onChange={e => setAddress({ ...address, name: e.target.value })} maxLength={63} spellCheck={false} /></Field><Field label="Description (optional)"><input value={address.description} placeholder="What is this address used for?" onChange={e => setAddress({ ...address, description: e.target.value })} maxLength={255} /></Field></>}
      {tab === 'services' && <><div className="form-row service-row"><Field label="Protocol"><select value={service.protocol} onChange={e => setService({ ...service, protocol: e.target.value as 'tcp' | 'udp' })}><option value="tcp">TCP</option><option value="udp">UDP</option></select></Field><Field label="Destination ports" hint="Single port, comma-separated list, or range."><input className="mono" value={service.ports} placeholder="443 or 80,443,8000-8100" onChange={e => setService({ ...service, ports: e.target.value })} spellCheck={false} /></Field></div><Field label="Service name" hint="Leave blank to name it from the protocol and ports."><input value={service.name} placeholder="e.g. TCP-443" onChange={e => setService({ ...service, name: e.target.value })} maxLength={63} spellCheck={false} /></Field><details className="advanced" open={service.sourcePorts || service.description ? true : undefined}><summary>Source ports & description <span>Optional</span></summary><Field label="Source ports" hint="Leave blank to allow any source port."><input className="mono" value={service.sourcePorts} placeholder="e.g. 1024-65535" onChange={e => setService({ ...service, sourcePorts: e.target.value })} /></Field><Field label="Description"><input value={service.description} placeholder="What is this service used for?" onChange={e => setService({ ...service, description: e.target.value })} maxLength={255} /></Field></details></>}
      {tab === 'groups' && <><div className="form-row"><Field label="Group type"><select value={group.kind} onChange={e => setGroup({ ...group, kind: e.target.value as ObjectKind, members: [] })}><option value="address">Address group</option><option value="service">Service group</option></select></Field><Field label="Group name"><input value={group.name} placeholder={group.kind === 'address' ? 'e.g. WEB-SERVERS' : 'e.g. WEB-SERVICES'} onChange={e => setGroup({ ...group, name: e.target.value })} maxLength={63} spellCheck={false} /></Field></div><div className="member-label"><strong>Group members</strong><button type="button" disabled={!choices.length} onClick={() => setGroup({ ...group, members: group.members.length === choices.length ? [] : choices.map(o => o.id) })}>{choices.length > 0 && group.members.length === choices.length ? 'Deselect all' : 'Select all'}</button></div><div className="member-picker">{choices.length ? choices.map(o => <label key={o.id} className="member-option"><input type="checkbox" checked={group.members.includes(o.id)} onChange={e => setGroup({ ...group, members: e.target.checked ? [...group.members, o.id] : group.members.filter(id => id !== o.id) })} /><span>{o.name}</span><code>{'value' in o ? o.value : `${o.protocol.toUpperCase()} ${o.ports}`}</code></label>) : <div className="member-empty"><Icon name={group.kind === 'address' ? 'address' : 'service'} size={25} /><p>Add some {group.kind} objects first.</p><button className="button secondary" type="button" onClick={() => switchTab(group.kind === 'address' ? 'addresses' : 'services')}>Add {group.kind} objects</button></div>}</div></>}
      <FormError error={error} />{footer}
    </form>}
  </section>
}
