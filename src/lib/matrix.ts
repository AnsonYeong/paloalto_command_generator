import { addressError, inferAddressType, nameError, newId, normalizeAddress, normalizePorts, portsError, suggestedName } from './generator.ts'
import type { AddressObject, AddressType, ServiceObject, Workspace } from './generator.ts'

export interface MatrixMerge { startRow: number; endRow: number; startColumn: number; endColumn: number }
export interface MatrixSheet { name: string; rows: string[][]; merges: MatrixMerge[]; formulaCount: number; hidden: boolean }
export interface MatrixBook { name: string; sheets: MatrixSheet[] }
export const matrixRoles = [
  ['ignore', 'Ignore'], ['source', 'Source IP / address'], ['destination', 'Destination IP / address'],
  ['ports', 'Destination ports / services'], ['protocol', 'Protocol'], ['sourcePorts', 'Source ports'],
  ['sourceName', 'Source name / description'], ['destinationName', 'Destination name / description'],
  ['serviceName', 'Service name'], ['description', 'Remarks / application'],
] as const
export type MatrixRole = typeof matrixRoles[number][0]
export type RowFields = Record<Exclude<MatrixRole, 'ignore'>, string>
export interface MatrixConfig { headerRow: number; headerDepth: number; mapping: MatrixRole[] }
export interface ParsedAddress { type: AddressType; value: string }
export interface ParsedService { protocol: 'tcp' | 'udp'; ports: string; sourcePorts: string }
export interface MatrixRow {
  id: string; sheet: string; row: number; fields: RowFields; context: string; searchText: string;
  sources: ParsedAddress[]; destinations: ParsedAddress[]; services: ParsedService[]; issues: string[]
}
export interface MatrixOptions { sources: boolean; destinations: boolean; services: boolean; missingProtocol: '' | 'tcp' | 'udp'; useNames: boolean }
export const defaultMatrixOptions: MatrixOptions = { sources: true, destinations: true, services: true, missingProtocol: '', useNames: false }
export const emptyFields = (): RowFields => ({ source: '', destination: '', ports: '', protocol: '', sourcePorts: '', sourceName: '', destinationName: '', serviceName: '', description: '' })
export const columnLetter = (index: number): string => index < 26 ? String.fromCharCode(65 + index) : columnLetter(Math.floor(index / 26) - 1) + columnLetter(index % 26)
const clean = (text: string) => text.replace(/\u00a0/g, ' ').replace(/[–—−]/g, '-').trim()
const headerText = (text: string) => clean(text).toLowerCase().replace(/[_\W]+/g, ' ').trim()

export function suggestRole(label: string): MatrixRole {
  const h = headerText(label)
  if (!h || h.length > 110 || /\d+\.\d+\.\d+\.\d+/.test(label) || /\bnat\b|translated|translation/.test(h)) return 'ignore'
  const src = /\b(source|src|from|origin|client)\b/.test(h)
  const dst = /\b(destination|dest|dst|to|target)\b/.test(h)
  if (/\bports?\b/.test(h)) return src ? 'sourcePorts' : 'ports'
  if (/\bprotocol\b|\bproto\b|transport/.test(h)) return 'protocol'
  if (/\bservice\s+name\b/.test(h)) return 'serviceName'
  if (/^(services?|tcp|udp|tcp udp|udp tcp)$/.test(h)) return 'ports'
  if (src || dst) {
    if (/\b(ip|ips|addr|address|addresses|subnet|network|fqdn)\b/.test(h)) return dst ? 'destination' : 'source'
    if (/\b(name|hostname|description|server|host)\b/.test(h)) return dst ? 'destinationName' : 'sourceName'
    if (/^(source|src|from|origin|client|destination|dest|dst|to|target)$/.test(h)) return dst ? 'destination' : 'source'
  }
  if (/^(ip|ip address|address|subnet|fqdn|network)$/.test(h)) return 'source'
  if (/^(host name|hostname|object name)$/.test(h)) return 'sourceName'
  if (/\b(remarks?|comments?|application|purpose|description)\b/.test(h)) return 'description'
  return 'ignore'
}

function mergedCell(sheet: MatrixSheet, row: number, column: number, header = false, dataStart = 0): string {
  const direct = sheet.rows[row]?.[column] || ''
  if (direct) return direct
  const merge = sheet.merges.find(m => m.startRow <= row && m.endRow >= row && m.startColumn <= column && m.endColumn >= column && (header || (m.startColumn === m.endColumn && m.startRow >= dataStart)))
  return merge ? sheet.rows[merge.startRow]?.[merge.startColumn] || '' : ''
}

export function matrixHeaders(sheet: MatrixSheet, config: Pick<MatrixConfig, 'headerRow' | 'headerDepth'>): string[] {
  const width = Math.max(0, ...sheet.rows.map(r => r.length))
  return Array.from({ length: width }, (_, column) => [...new Set(Array.from({ length: config.headerDepth }, (_, offset) => mergedCell(sheet, config.headerRow + offset, column, true).trim()).filter(Boolean))].join(' / '))
}

export function detectMatrixLayout(sheet: MatrixSheet): MatrixConfig & { score: number; detected: boolean } {
  let best: MatrixConfig & { score: number; detected: boolean } = { headerRow: 0, headerDepth: 1, mapping: [], score: 0, detected: false }
  for (let row = 0; row < Math.min(sheet.rows.length, 120); row++) {
    for (let depth = 1; depth <= 3 && row + depth <= sheet.rows.length; depth++) {
      const mapping = matrixHeaders(sheet, { headerRow: row, headerDepth: depth }).map(suggestRole)
      const roles = new Set(mapping)
      const weights: Partial<Record<MatrixRole, number>> = { source: 8, destination: 8, ports: 8, protocol: 4, sourceName: 3, destinationName: 3, sourcePorts: 2, serviceName: 2, description: 1 }
      const score = [...roles].reduce((sum, role) => sum + (weights[role] || 0), 0) - depth * .3 - (sheet.rows[row].filter(Boolean).length < 2 ? 4 : 0)
      if (score > best.score) best = { headerRow: row, headerDepth: depth, mapping, score, detected: roles.has('ports') && (roles.has('source') || roles.has('destination')) }
    }
  }
  // A second header tier may inherit key labels from vertical merges above it.
  const ancestors = sheet.merges.filter(m => m.startRow < best.headerRow && m.endRow >= best.headerRow && best.mapping[m.startColumn] !== 'ignore')
  const top = Math.min(best.headerRow, ...ancestors.map(m => m.startRow))
  if (best.headerRow - top + best.headerDepth <= 3) {
    best.headerDepth += best.headerRow - top
    best.headerRow = top
    best.mapping = matrixHeaders(sheet, best).map(suggestRole)
  }
  return best
}

function maskPrefix(mask: string): number | null {
  const octets = mask.split('.').map(Number)
  if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null
  const bits = octets.map(n => n.toString(2).padStart(8, '0')).join('')
  return /^1*0*$/.test(bits) ? bits.indexOf('0') < 0 ? 32 : bits.indexOf('0') : null
}

export function parseMatrixAddresses(input: string): { values: ParsedAddress[]; issues: string[] } {
  const values: ParsedAddress[] = [], issues: string[] = []
  for (let piece of clean(input).split(/[\n\r;,]+/).map(p => p.trim()).filter(Boolean)) {
    // Ignore standalone location labels, but never infer an IP from a hostname placeholder.
    if (/^[a-z][\w .-]*\s*:\s*$/i.test(piece)) continue
    piece = piece.replace(/^[•]\s*/, '').replace(/^[a-z][\w .-]*:\s+/i, '').replace(/\s*-\s*/g, '-')
    const mask = piece.match(/^(\d+(?:\.\d+){3})[/\s]+(\d+(?:\.\d+){3})$/)
    if (mask && /^(255\.|0\.0\.0\.0$)/.test(mask[2])) {
      const prefix = maskPrefix(mask[2])
      if (prefix === null) { issues.push(`Invalid subnet mask: ${piece}`); continue }
      piece = `${mask[1]}/${prefix}`
    }
    const candidates = piece.split(/\s+/)
    for (const candidate of candidates) {
      const type = inferAddressType(candidate)
      if (addressError(type, candidate)) { issues.push(`Unresolved address: ${candidate}`); continue }
      const value = normalizeAddress(type, candidate)
      if (!values.some(v => v.type === type && v.value === value)) values.push({ type, value })
    }
  }
  return { values, issues: [...new Set(issues)] }
}

function protocols(input: string): ('tcp' | 'udp')[] {
  const text = input.toLowerCase().replace(/[\s/,&+]+|\band\b/g, '')
  if (text === 'tcp' || text === '6') return ['tcp']
  if (text === 'udp' || text === '17') return ['udp']
  if (text === 'tcpudp' || text === 'udptcp') return ['tcp', 'udp']
  return []
}

export function parseMatrixServices(input: string, protocolCell = '', sourcePorts = '', fallback: '' | 'tcp' | 'udp' = ''): { values: ParsedService[]; issues: string[] } {
  const values: ParsedService[] = [], issues: string[] = []
  const src = /^(any|n\/a|-)?$/i.test(sourcePorts.trim()) ? '' : clean(sourcePorts).replace(/\s*-\s*/g, '-').replace(/[;\n]+/g, ',')
  if (portsError(src, true)) return { values, issues: [`Invalid source ports: ${sourcePorts}`] }
  const separate = protocols(protocolCell)
  if (protocolCell.trim() && !separate.length) return { values, issues: [`Unsupported or unresolved protocol: ${protocolCell}`] }
  function add(body: string, proto: string, original: string) {
    const types = protocols(proto)
    if (!types.length) { issues.push(`Unsupported or missing protocol: ${original}`); return }
    if (separate.length && proto && (types.length !== separate.length || types.some(p => !separate.includes(p)))) {
      issues.push(`Conflicting protocols in service and protocol columns: ${original}`); return
    }
    const portText = body.replace(/^[\s:=(/]+/, '').replace(/[\s),/]+$/, '').replace(/\s*-\s*/g, '-').replace(/\s*,\s*/g, ',').replace(/\s+/g, ',')
    if (portsError(portText)) { issues.push(`Unresolved ports: ${original}`); return }
    for (const protocol of types) for (const ports of normalizePorts(portText).split(',')) {
      if (!values.some(v => v.protocol === protocol && v.ports === ports && v.sourcePorts === src)) values.push({ protocol, ports, sourcePorts: src ? normalizePorts(src) : '' })
    }
  }
  for (const original of clean(input).split(/[\r\n;]+/).map(p => p.trim()).filter(Boolean)) {
    const piece = original.replace(/\b(tcp|udp)_(?=\d)/gi, '$1 ')
    const suffix = piece.match(/^([\d\s,()-]+)\s*\/\s*(TCP|UDP|TCP\/UDP|UDP\/TCP)$/i)
    if (suffix) { add(suffix[1], suffix[2], original); continue }
    const matches = [...piece.matchAll(/\b(TCP\s*(?:\/|&|\+|and)\s*UDP|UDP\s*(?:\/|&|\+|and)\s*TCP|TCP|UDP|ICMPV6|ICMP|GRE|ESP|SCTP)\b/gi)]
    if (!matches.length) { add(piece, protocolCell.trim() || fallback, original); continue }
    if (piece.slice(0, matches[0].index).trim()) { issues.push(`Unresolved service text: ${original}`); continue }
    matches.forEach((match, i) => add(piece.slice(match.index! + match[0].length, matches[i + 1]?.index), match[0], original))
  }
  return { values, issues: [...new Set(issues)] }
}

export function parseMatrixRow(id: string, sheet: string, row: number, fields: RowFields, context: string, searchText: string, options: MatrixOptions): MatrixRow {
  const sources = options.sources ? parseMatrixAddresses(fields.source) : { values: [], issues: [] }
  const destinations = options.destinations ? parseMatrixAddresses(fields.destination) : { values: [], issues: [] }
  const services = options.services ? parseMatrixServices(fields.ports, fields.protocol, fields.sourcePorts, options.missingProtocol) : { values: [], issues: [] }
  const issues = [...sources.issues.map(i => `Source: ${i}`), ...destinations.issues.map(i => `Destination: ${i}`), ...services.issues]
  if (options.sources && fields.source.trim() && !sources.values.length && !sources.issues.length) issues.push('Source contains a label but no address.')
  if (options.destinations && fields.destination.trim() && !destinations.values.length && !destinations.issues.length) issues.push('Destination contains a label but no address.')
  return { id, sheet, row, fields, context, searchText, sources: sources.values, destinations: destinations.values, services: services.values, issues }
}

export function extractMatrixRows(sheet: MatrixSheet, config: MatrixConfig, options: MatrixOptions, edits: Record<string, RowFields> = {}): MatrixRow[] {
  const result: MatrixRow[] = []
  let context = ''
  const headers = matrixHeaders(sheet, config)
  const start = config.headerRow + config.headerDepth
  for (let r = start; r < sheet.rows.length; r++) {
    const raw = sheet.rows[r]
    if (!raw.some(v => v.trim())) continue
    const nonempty = raw.map((v, c) => ({ v, c })).filter(o => o.v.trim())
    const sectionMerge = sheet.merges.some(m => m.startRow === r && m.endRow === r && m.endColumn > m.startColumn && config.mapping.slice(m.startColumn, m.endColumn + 1).filter(role => ['source', 'destination', 'ports'].includes(role)).length > 1)
    if (nonempty.length === 1 && ((config.mapping[nonempty[0].c] || 'ignore') === 'ignore' || sectionMerge)) { context = nonempty[0].v; continue }
    const fields = emptyFields()
    config.mapping.forEach((role, c) => {
      if (role === 'ignore') return
      let value = mergedCell(sheet, r, c, false, start)
      if (role === 'ports' && value && !/\b(tcp|udp|icmp)\b/i.test(value)) {
        const proto = headers[c]?.match(/\b(TCP\s*(?:\/|&|\+|and)\s*UDP|UDP\s*(?:\/|&|\+|and)\s*TCP|TCP|UDP)\b/i)?.[1]
        if (proto) value = `${proto} ${value}`
      }
      if (value) fields[role] = [fields[role], value].filter(Boolean).join('\n')
    })
    if (![fields.source, fields.destination, fields.ports].some(Boolean)) continue
    if ([fields.source, fields.destination, fields.ports].filter(Boolean).every(v => ['source', 'destination', 'ports'].includes(suggestRole(v)))) continue
    const id = `${sheet.name}:${r + 1}`
    const edited = edits[id] || fields
    const searchText = [sheet.name, context, ...raw, ...Object.values(edited)].join(' ').toLowerCase()
    const row = parseMatrixRow(id, sheet.name, r + 1, edited, context, searchText, options)
    if (options.sources && config.mapping.includes('source') && !edited.source.trim()) row.issues.push('Source address is blank.')
    if (options.destinations && config.mapping.includes('destination') && !edited.destination.trim()) row.issues.push('Destination address is blank.')
    if (options.services && config.mapping.includes('ports') && !edited.ports.trim()) row.issues.push('Destination ports / services are blank.')
    result.push(row)
  }
  return result
}

export function matchesKeywords(row: MatrixRow, keywords: string, all = false): boolean {
  const terms = keywords.split(/[,;\n]+/).map(t => t.trim().toLowerCase()).filter(Boolean)
  return !terms.length || (all ? terms.every(t => row.searchText.includes(t)) : terms.some(t => row.searchText.includes(t)))
}

export interface ImportItem { kind: 'address' | 'service'; object: AddressObject | ServiceObject; existing: boolean; rows: string[] }
export interface MatrixPlan { items: ImportItem[]; addresses: AddressObject[]; services: ServiceObject[]; renamed: string[] }
const safeName = (text: string) => text.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[._-]+|[.-]+$/g, '').slice(0, 63)
// Strip CLI delimiters and control characters from untrusted description text.
// eslint-disable-next-line no-control-regex
const safeDescription = (text: string) => text.replace(/["\\\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 255)

export function planMatrixImport(rows: MatrixRow[], workspace: Workspace, options: MatrixOptions): MatrixPlan {
  const plan: MatrixPlan = { items: [], addresses: [], services: [], renamed: [] }
  const addressKey = (a: ParsedAddress) => `${a.type}:${normalizeAddress(a.type, a.value).toLowerCase()}`
  const serviceKey = (s: ParsedService) => `${s.protocol}:${normalizePorts(s.ports)}:${s.sourcePorts ? normalizePorts(s.sourcePorts) : ''}`
  const knownAddresses = new Map(workspace.addresses.map(a => [addressKey(a), a]))
  const knownServices = new Map(workspace.services.map(s => [serviceKey(s), s]))
  const usedAddress = new Set([...workspace.addresses.map(a => a.name), ...workspace.groups.filter(g => g.kind === 'address').map(g => g.name)])
  const usedService = new Set([...workspace.services.map(s => s.name), ...workspace.groups.filter(g => g.kind === 'service').map(g => g.name), 'service-http', 'service-https'])
  const items = new Map<string, ImportItem>()
  function unique(name: string, used: Set<string>): string {
    let candidate = name, suffix = 2
    while (used.has(candidate)) { const end = `-${suffix++}`; candidate = name.slice(0, 63 - end.length) + end }
    if (candidate !== name) plan.renamed.push(`${name} → ${candidate}`)
    used.add(candidate)
    return candidate
  }
  function record(kind: 'address' | 'service', key: string, object: AddressObject | ServiceObject, existing: boolean, row: MatrixRow) {
    const previous = items.get(`${kind}:${key}`)
    if (previous) { if (!previous.rows.includes(row.id)) previous.rows.push(row.id); return }
    const item = { kind, object, existing, rows: [row.id] }
    items.set(`${kind}:${key}`, item); plan.items.push(item)
  }
  for (const row of rows) {
    for (const [values, labels] of [[row.sources, row.fields.sourceName], [row.destinations, row.fields.destinationName]] as const) {
      const names = labels.split(/[\r\n;]+/).map(s => s.trim()).filter(Boolean)
      values.forEach((value, i) => {
        const key = addressKey(value), old = knownAddresses.get(key)
        if (old) { record('address', key, old, true, row); return }
        if (items.has(`address:${key}`)) { record('address', key, items.get(`address:${key}`)!.object, false, row); return }
        const label = names.length === values.length ? names[i] : names.length === 1 ? `${names[0]}${values.length > 1 ? `-${i + 1}` : ''}` : ''
        const hostValue = value.value.replace(value.value.includes(':') ? /\/128$/ : /\/32$/, '')
        const proposed = options.useNames && safeName(label) ? safeName(label) : suggestedName(value.type, hostValue)
        const name = unique(nameError(proposed) ? suggestedName(value.type, value.value) : proposed, usedAddress)
        const object: AddressObject = { ...value, id: newId(), name, description: safeDescription(label || labels || row.fields.description) }
        plan.addresses.push(object); record('address', key, object, false, row)
      })
    }
    row.services.forEach(value => {
      const key = serviceKey(value), old = knownServices.get(key)
      if (old) { record('service', key, old, true, row); return }
      if (items.has(`service:${key}`)) { record('service', key, items.get(`service:${key}`)!.object, false, row); return }
      const base = `${value.protocol.toUpperCase()}-${value.ports}${value.sourcePorts ? `-SRC-${value.sourcePorts}` : ''}`
      const proposed = options.useNames && safeName(row.fields.serviceName) ? `${safeName(row.fields.serviceName)}-${base}` : base
      const object: ServiceObject = { ...value, id: newId(), name: unique(safeName(proposed), usedService), description: safeDescription(row.fields.description) }
      plan.services.push(object); record('service', key, object, false, row)
    })
  }
  return plan
}
