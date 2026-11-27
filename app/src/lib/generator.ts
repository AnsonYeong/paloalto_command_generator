export type AddressType = 'ip-netmask' | 'ip-range' | 'fqdn'
export type Scope = 'firewall' | 'vsys' | 'shared' | 'device-group'
export type ObjectKind = 'address' | 'service'

export interface AddressObject {
  id: string
  name: string
  type: AddressType
  value: string
  description: string
}

export interface ServiceObject {
  id: string
  name: string
  protocol: 'tcp' | 'udp'
  ports: string
  sourcePorts: string
  description: string
}

export interface ObjectGroup {
  id: string
  name: string
  kind: ObjectKind
  members: string[]
}

export interface Workspace {
  version: 1
  addresses: AddressObject[]
  services: ServiceObject[]
  groups: ObjectGroup[]
  scope: Scope
  scopeName: string
  includeConfigure: boolean
  includeCommit: boolean
}

export interface Issue { id: string; message: string }
export interface CommandLine { text: string; section: string }

export const emptyWorkspace = (): Workspace => ({
  version: 1, addresses: [], services: [], groups: [], scope: 'firewall',
  scopeName: '', includeConfigure: true, includeCommit: false,
})

export const newId = () => crypto.randomUUID()

export function nameError(name: string): string | null {
  if (!name.trim()) return 'Enter an object name.'
  if (name !== name.trim()) return 'Remove spaces at the start or end of the name.'
  if (name.length > 63) return 'Names must be 63 characters or fewer.'
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 ._-]*$/.test(name)) {
    return 'Start with a letter or number; use letters, numbers, spaces, dots, hyphens, or underscores.'
  }
  return null
}

function descriptionError(description: string): string | null {
  if (description.length > 255) return 'Keep the description to 255 characters or fewer.'
  if (/["\\\x00-\x1f\x7f]/.test(description)) return 'Descriptions cannot contain double quotes, backslashes, or control characters.'
  return null
}

function ipv4(value: string): bigint | null {
  const parts = value.split('.')
  if (parts.length !== 4 || parts.some(p => !/^(0|[1-9]\d{0,2})$/.test(p) || Number(p) > 255)) return null
  return parts.reduce((result, p) => (result << 8n) + BigInt(p), 0n)
}

function ip(value: string): { bits: number; number: bigint } | null {
  const v4 = ipv4(value)
  if (v4 !== null) return { bits: 32, number: v4 }
  if (!value.includes(':') || !/^[a-fA-F0-9:.]+$/.test(value)) return null
  try {
    const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1)
    const halves = canonical.split('::')
    const left = halves[0] ? halves[0].split(':') : []
    const right = halves[1] ? halves[1].split(':') : []
    const parts = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left
    if (parts.length !== 8) return null
    return { bits: 128, number: parts.reduce((result, p) => (result << 16n) + BigInt(`0x${p}`), 0n) }
  } catch { return null }
}

export function addressError(type: AddressType, value: string): string | null {
  if (!value.trim()) return 'Enter an IP address, subnet, range, or FQDN.'
  if (value !== value.trim()) return 'Remove surrounding spaces from the address.'
  if (type === 'fqdn') {
    const fqdn = value.endsWith('.') ? value.slice(0, -1) : value
    if (fqdn.length > 253 || !fqdn.includes('.') || !/[a-z]/i.test(fqdn) ||
      fqdn.split('.').some(label => !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))) {
      return 'Enter a valid fully qualified domain name, such as app.example.com.'
    }
    return null
  }
  if (type === 'ip-range') {
    const parts = value.split('-')
    const start = ip(parts[0] ?? '')
    const end = ip(parts[1] ?? '')
    if (parts.length !== 2 || !start || !end || start.bits !== end.bits) return 'Enter two valid IPs of the same version, separated by a hyphen.'
    if (start.number > end.number) return 'The range must start with the lower IP address.'
    return null
  }
  const parts = value.split('/')
  const parsed = ip(parts[0])
  if (parts.length > 2 || !parsed) return 'Enter a valid IPv4 or IPv6 address, optionally with a CIDR prefix.'
  if (parts.length === 2 && (!/^(0|[1-9]\d{0,2})$/.test(parts[1]) || Number(parts[1]) > parsed.bits)) {
    return `Use a CIDR prefix between 0 and ${parsed.bits}.`
  }
  return null
}

export function portsError(ports: string, optional = false): string | null {
  if (!ports.trim()) return optional ? null : 'Enter at least one destination port.'
  for (const part of ports.split(',')) {
    const token = part.trim()
    if (!/^\d{1,5}(-\d{1,5})?$/.test(token)) return 'Use ports like 443, 80,443, or 8000-8100.'
    const [start, end = start] = token.split('-').map(Number)
    if (start > 65535 || end > 65535) return 'Ports must be between 0 and 65535.'
    if (start > end) return 'Port ranges must start with the lower port.'
  }
  return null
}

export function normalizePorts(ports: string): string {
  return [...new Set(ports.split(',').map(p => p.trim().split('-').map(Number).join('-')))].join(',')
}

export function normalizeAddress(type: AddressType, value: string): string {
  if (type === 'fqdn') return value.toLowerCase()
  if (type === 'ip-netmask' && !value.includes('/')) return `${value}/${value.includes(':') ? 128 : 32}`
  return value
}

export function suggestedName(type: AddressType, value: string): string {
  if (!value.trim()) return ''
  const prefix = type === 'fqdn' ? 'FQDN' : type === 'ip-range' ? 'RANGE' : value.includes('/') ? 'NET' : 'HOST'
  return `${prefix}_${value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_')}`.slice(0, 63)
}

function updateGeneratedAddressNames(workspace: Workspace): Workspace {
  const used = new Set([...workspace.addresses.map(a => a.name), ...workspace.groups.filter(g => g.kind === 'address').map(g => g.name)])
  const addresses = workspace.addresses.map(address => {
    if (addressError(address.type, address.value)) return address
    const candidates = [address.value]
    // Matrix imports named host objects before appending their /32 or /128 prefix.
    if (address.type === 'ip-netmask') candidates.push(address.value.replace(address.value.includes(':') ? /\/128$/ : /\/32$/, ''))
    const original = candidates.find(value => {
      const prefix = address.type === 'fqdn' ? 'FQDN' : address.type === 'ip-range' ? 'RANGE' : value.includes('/') ? 'NET' : 'HOST'
      return address.name === `${prefix}-${value.replace(/[^a-zA-Z0-9_-]+/g, '-')}`.slice(0, 63)
    })
    // Only exact matches to the previous generated pattern are upgraded.
    if (!original) return address
    const base = suggestedName(address.type, original)
    let name = base, suffix = 2
    while (used.has(name)) { const ending = `-${suffix++}`; name = base.slice(0, 63 - ending.length) + ending }
    used.add(name)
    return { ...address, name }
  })
  // Groups refer to stable object IDs, so their memberships survive the rename.
  return { ...workspace, addresses }
}

export function inferAddressType(value: string): AddressType {
  if (value.includes('-') && ip(value.split('-')[0])) return 'ip-range'
  if (value.includes(':') || /^[\d.]+(\/\d+)?$/.test(value)) return 'ip-netmask'
  return 'fqdn'
}

export function parseBulkAddresses(text: string): { addresses: AddressObject[]; errors: string[] } {
  const addresses: AddressObject[] = []
  const errors: string[] = []
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return
    const parts = line.trim().split(/[\t,]/).map(p => p.trim())
    if (parts.length > 2) { errors.push(`Line ${index + 1}: use IP alone or name,IP.`); return }
    const value = parts.at(-1)!
    const type = inferAddressType(value)
    const name = parts.length === 2 ? parts[0] : suggestedName(type, value)
    const error = nameError(name) || addressError(type, value)
    if (error) { errors.push(`Line ${index + 1}: ${error}`); return }
    if (addresses.some(a => a.name === name)) { errors.push(`Line ${index + 1}: duplicate name "${name}".`); return }
    addresses.push({ id: newId(), name, type, value: normalizeAddress(type, value), description: '' })
  })
  return { addresses, errors }
}

export function validateWorkspace(workspace: Workspace): Issue[] {
  const issues: Issue[] = []
  const add = (id: string, error: string | null, label: string) => { if (error) issues.push({ id, message: `${label}: ${error}` }) }
  if (workspace.scope === 'vsys' || workspace.scope === 'device-group') {
    add('scope', nameError(workspace.scopeName), workspace.scope === 'vsys' ? 'Virtual system' : 'Device group')
  }
  const usedNames = { address: new Set<string>(), service: new Set<string>() }
  const usedIds = new Set<string>()
  const claim = (id: string, name: string, kind: ObjectKind) => {
    if (usedIds.has(id)) issues.push({ id, message: 'Each object and group must have a unique ID.' })
    usedIds.add(id)
    add(id, nameError(name), name || 'Unnamed object')
    if (usedNames[kind].has(name)) issues.push({ id, message: `The ${kind} name "${name}" is used more than once.` })
    usedNames[kind].add(name)
  }
  workspace.addresses.forEach(a => {
    claim(a.id, a.name, 'address')
    add(a.id, addressError(a.type, a.value), a.name)
    add(a.id, descriptionError(a.description), a.name)
  })
  workspace.services.forEach(s => {
    claim(s.id, s.name, 'service')
    if (s.name === 'service-http' || s.name === 'service-https') add(s.id, 'This name is reserved for a predefined service.', s.name)
    add(s.id, portsError(s.ports), s.name)
    add(s.id, portsError(s.sourcePorts, true), `${s.name} source ports`)
    add(s.id, descriptionError(s.description), s.name)
  })
  workspace.groups.forEach(g => {
    claim(g.id, g.name, g.kind)
    if (g.kind === 'service' && ['service-http', 'service-https'].includes(g.name)) add(g.id, 'This name is reserved for a predefined service.', g.name)
    if (!g.members.length) add(g.id, 'Select at least one member.', g.name)
    const available = new Set((g.kind === 'address' ? workspace.addresses : workspace.services).map(o => o.id))
    if (g.members.some(id => !available.has(id))) add(g.id, 'A selected member no longer exists.', g.name)
    if (new Set(g.members).size !== g.members.length) add(g.id, 'Group members must be unique.', g.name)
  })
  return issues
}

const quote = (value: string) => `"${value}"`
// Validated names only need quoting when spaces would split the CLI argument.
const cliName = (value: string) => value.includes(' ') ? quote(value) : value

export function generateCommands(workspace: Workspace): { lines: CommandLine[]; issues: Issue[] } {
  const issues = validateWorkspace(workspace)
  if (issues.length) return { lines: [], issues }
  const lines: CommandLine[] = []
  const push = (text: string, section: string) => lines.push({ text, section })
  const prefix = workspace.scope === 'firewall' ? 'set' : workspace.scope === 'shared' ? 'set shared' : `set ${workspace.scope} ${cliName(workspace.scopeName)}`
  if (!workspace.addresses.length && !workspace.services.length && !workspace.groups.length) return { lines, issues }
  if (workspace.includeConfigure) push('configure', 'Session')
  workspace.addresses.forEach(a => {
    push(`${prefix} address ${cliName(a.name)} ${a.type} ${normalizeAddress(a.type, a.value)}`, 'Addresses')
    if (a.description) push(`${prefix} address ${cliName(a.name)} description ${quote(a.description)}`, 'Addresses')
  })
  workspace.services.forEach(s => {
    const source = s.sourcePorts.trim() ? ` source-port ${normalizePorts(s.sourcePorts)}` : ''
    push(`${prefix} service ${cliName(s.name)} protocol ${s.protocol} port ${normalizePorts(s.ports)}${source}`, 'Services')
    push(`${prefix} service ${cliName(s.name)} protocol ${s.protocol} override no`, 'Services')
    if (s.description) push(`${prefix} service ${cliName(s.name)} description ${quote(s.description)}`, 'Services')
  })
  workspace.groups.forEach(g => {
    const objects = g.kind === 'address' ? workspace.addresses : workspace.services
    // One membership per command avoids very long CLI lines for large batches.
    g.members.forEach(id => push(`${prefix} ${g.kind}-group ${cliName(g.name)} ${g.kind === 'address' ? 'static' : 'members'} ${cliName(objects.find(o => o.id === id)!.name)}`, 'Groups'))
  })
  if (workspace.includeCommit) push('commit', 'Session')
  return { lines, issues }
}

export function readWorkspace(value: unknown): Workspace {
  if (!value || typeof value !== 'object') throw new Error('Choose a workspace JSON file exported by this tool.')
  const w = value as Record<string, unknown>
  const strings = (v: Record<string, unknown>, fields: string[]) => fields.every(f => typeof v[f] === 'string')
  const records = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.every(o => o && typeof o === 'object' && !Array.isArray(o))
  if (w.version !== 1 || !records(w.addresses) || !records(w.services) || !records(w.groups) ||
    !['firewall', 'vsys', 'shared', 'device-group'].includes(w.scope as string) || typeof w.scopeName !== 'string' ||
    typeof w.includeConfigure !== 'boolean' || typeof w.includeCommit !== 'boolean' ||
    !w.addresses.every(a => strings(a, ['id', 'name', 'type', 'value', 'description']) && ['ip-netmask', 'ip-range', 'fqdn'].includes(a.type as string)) ||
    !w.services.every(s => strings(s, ['id', 'name', 'protocol', 'ports', 'sourcePorts', 'description']) && ['tcp', 'udp'].includes(s.protocol as string)) ||
    !w.groups.every(g => strings(g, ['id', 'name', 'kind']) && ['address', 'service'].includes(g.kind as string) && Array.isArray(g.members) && g.members.every(m => typeof m === 'string'))) {
    throw new Error('This file is not a supported command-builder workspace.')
  }
  return updateGeneratedAddressNames(w as unknown as Workspace)
}

export function exampleWorkspace(): Workspace {
  const addresses: AddressObject[] = [
    { id: newId(), name: 'WEB-SERVER-01', type: 'ip-netmask', value: '192.168.10.10/32', description: '' },
    { id: newId(), name: 'WEB-SERVER-02', type: 'ip-netmask', value: '192.168.10.11/32', description: '' },
    { id: newId(), name: 'OFFICE-NET', type: 'ip-netmask', value: '10.20.0.0/24', description: '' },
  ]
  const services: ServiceObject[] = [
    { id: newId(), name: 'TCP-443', protocol: 'tcp', ports: '443', sourcePorts: '', description: '' },
    { id: newId(), name: 'TCP-80', protocol: 'tcp', ports: '80', sourcePorts: '', description: '' },
  ]
  return { ...emptyWorkspace(), addresses, services, groups: [
    { id: newId(), name: 'WEB-SERVERS', kind: 'address', members: addresses.slice(0, 2).map(a => a.id) },
    { id: newId(), name: 'WEB-SERVICES', kind: 'service', members: services.map(s => s.id) },
  ] }
}
