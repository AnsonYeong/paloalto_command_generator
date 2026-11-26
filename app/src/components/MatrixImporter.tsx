import { useEffect, useMemo, useRef, useState } from 'react'
import type { Workspace } from '../lib/generator'
import { columnLetter, defaultMatrixOptions, extractMatrixRows, matchesKeywords, matrixHeaders, matrixRoles, planMatrixImport, suggestRole } from '../lib/matrix'
import type { MatrixBook, MatrixConfig, MatrixOptions, MatrixPlan, MatrixRole, MatrixRow, RowFields } from '../lib/matrix'
import { Field, Icon } from './ui'
import './MatrixImporter.css'

type Layout = MatrixConfig & { detected: boolean; score: number }
interface Props { workspace: Workspace; onClose: () => void; onImport: (plan: MatrixPlan) => void }
const PAGE_SIZE = 30

export function MatrixImporter({ workspace, onClose, onImport }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const requestRef = useRef(0)
  const [book, setBook] = useState<MatrixBook | null>(null)
  const [layouts, setLayouts] = useState<Layout[]>([])
  const [configs, setConfigs] = useState<MatrixConfig[]>([])
  const [included, setIncluded] = useState<number[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stage, setStage] = useState<'mapping' | 'review'>('mapping')
  const [keywords, setKeywords] = useState('')
  const [matchAll, setMatchAll] = useState(false)
  const [options, setOptions] = useState<MatrixOptions>(defaultMatrixOptions)
  const [edits, setEdits] = useState<Record<string, RowFields>>({})
  const [selection, setSelection] = useState<Record<string, boolean>>({})
  const [allowPartial, setAllowPartial] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [page, setPage] = useState(0)

  useEffect(() => {
    dialogRef.current?.showModal()
    // These refs track the current asynchronous task, not a rendered DOM element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { workerRef.current?.terminate(); clearTimeout(timeoutRef.current); requestRef.current++ }
  }, [])

  const rows = useMemo(() => book ? included.flatMap(i => extractMatrixRows(book.sheets[i], configs[i], options, edits)) : [], [book, included, configs, options, edits])
  const matching = useMemo(() => rows.filter(row => matchesKeywords(row, keywords, matchAll)), [rows, keywords, matchAll])
  const hasValues = (row: MatrixRow) => !!(row.sources.length + row.destinations.length + row.services.length)
  const isSelected = (row: MatrixRow) => selection[row.id] ?? (!row.issues.length && hasValues(row))
  const selected = matching.filter(isSelected)
  const selectedIssues = selected.filter(r => r.issues.length)
  const plan = useMemo(() => planMatrixImport(matching.filter(r => selection[r.id] ?? (!r.issues.length && !!(r.sources.length + r.destinations.length + r.services.length))), workspace, options), [matching, selection, workspace, options])
  const reviewRows = onlyIssues ? matching.filter(r => r.issues.length) : matching
  const currentPage = Math.min(page, Math.max(0, Math.ceil(reviewRows.length / PAGE_SIZE) - 1))
  const visibleRows = reviewRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const sheet = book?.sheets[active]
  const config = configs[active]
  const headers = useMemo(() => sheet && config ? matrixHeaders(sheet, config) : [], [sheet, config])
  const added = plan.addresses.length + plan.services.length
  const reused = plan.items.filter(i => i.existing).length
  const issues = matching.filter(r => r.issues.length).length
  const formulaCount = included.reduce((n, i) => n + (book?.sheets[i].formulaCount || 0), 0)
  const anyMapping = included.some(i => configs[i]?.mapping.some(r => ['source', 'destination', 'ports'].includes(r)))

  async function readFile(file: File | undefined) {
    if (!file) return
    const request = ++requestRef.current
    workerRef.current?.terminate(); clearTimeout(timeoutRef.current)
    setError(''); setBook(null); setLoading(false); setStage('mapping')
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setError('Choose an Excel (.xlsx or .xls) or CSV file.'); return }
    if (file.size > 20 * 1024 * 1024) { setError('Choose a file smaller than 20 MB.'); return }
    setLoading(true)
    try {
      const data = await file.arrayBuffer()
      if (request !== requestRef.current) return
      const worker = new Worker(new URL('../workers/matrix.worker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker
      const fail = (message: string) => { if (request !== requestRef.current) return; worker.terminate(); clearTimeout(timeoutRef.current); setLoading(false); setError(message) }
      worker.onerror = () => fail('The file could not be read. Try exporting the required sheet as XLSX or CSV.')
      worker.onmessage = (event: MessageEvent<{ book: MatrixBook; layouts: Layout[]; error?: string }>) => {
        if (request !== requestRef.current) return
        if (event.data.error) { fail(event.data.error); return }
        clearTimeout(timeoutRef.current); worker.terminate()
        const next = event.data
        const first = Math.max(0, next.layouts.findIndex((l, i) => l.detected && !next.book.sheets[i].hidden))
        setBook(next.book); setLayouts(next.layouts); setConfigs(next.layouts); setIncluded([first]); setActive(first)
        setEdits({}); setSelection({}); setKeywords(''); setMatchAll(false); setAllowPartial(false); setOptions(defaultMatrixOptions)
        setExpanded(null); setPage(0); setOnlyIssues(false); setLoading(false)
      }
      timeoutRef.current = setTimeout(() => fail('Reading this workbook took too long. Export just the required sheets and try again.'), 30_000)
      worker.postMessage({ data, name: file.name }, [data])
    } catch (e) { if (request === requestRef.current) { setLoading(false); setError(e instanceof Error ? e.message : 'The file could not be read.') } }
  }
  function updateConfig(next: MatrixConfig) {
    setConfigs(current => current.map((c, i) => i === active ? next : c))
    setEdits(current => Object.fromEntries(Object.entries(current).filter(([id]) => !id.startsWith(`${sheet!.name}:`))))
    setSelection({}); setAllowPartial(false); setPage(0)
  }
  function updateHeader(headerRow: number, headerDepth: number) {
    const next = { headerRow, headerDepth }
    updateConfig({ ...next, mapping: matrixHeaders(sheet!, next).map(suggestRole) })
  }
  function changeOptions(next: MatrixOptions) { setOptions(next); setSelection({}); setAllowPartial(false); setPage(0) }
  function editField(row: MatrixRow, role: keyof RowFields, value: string) {
    setEdits(current => ({ ...current, [row.id]: { ...row.fields, [role]: value } }))
    setSelection(current => { const next = { ...current }; delete next[row.id]; return next })
    setAllowPartial(false)
  }
  function selectClean() { setSelection(Object.fromEntries(matching.map(r => [r.id, !r.issues.length && hasValues(r)]))); setAllowPartial(false) }

  return <dialog ref={dialogRef} className="matrix-dialog" aria-labelledby="matrix-title" onCancel={onClose}>
    <header className="matrix-header"><div><div className="eyebrow">WORKSPACE IMPORT</div><h2 id="matrix-title">Import firewall matrix</h2><p>Find the rows you need. Review the objects before adding them.</p></div><button className="icon-button" onClick={onClose} aria-label="Close matrix importer"><Icon name="close" /></button></header>
    <div className="matrix-body">
      <input ref={fileRef} className="matrix-file" type="file" accept=".xlsx,.xls,.csv" aria-label="Choose firewall matrix file" hidden onChange={e => { void readFile(e.target.files?.[0]); e.target.value = '' }} />
      {error && <div className="matrix-alert" role="alert">{error}</div>}
      {!book ? <div className="matrix-upload" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void readFile(e.dataTransfer.files[0]) }}>
        <span className="matrix-upload-icon"><Icon name="upload" size={30} /></span><h3>{loading ? 'Reading your workbook…' : 'Start with your customer’s matrix'}</h3>
        <p>{loading ? 'Detecting sheets and column headings.' : 'Drop an Excel or CSV file here, or choose one below.'}</p>
        <button className="button primary" disabled={loading} onClick={() => fileRef.current?.click()}><Icon name="upload" />Choose file</button>
        <small>XLSX, XLS or CSV · Up to 20 MB · File contents stay in your browser</small>
        <div className="matrix-upload-details"><span><strong>01</strong> Choose sheets & map columns</span><span><strong>02</strong> Filter, review & correct rows</span><span><strong>03</strong> Add address & service objects</span></div>
      </div> : <>
        <div className="matrix-file-bar"><div><Icon name="book" /><strong title={book.name}>{book.name}</strong><span>{book.sheets.length} {book.sheets.length === 1 ? 'sheet' : 'sheets'}</span></div><button className="button secondary" onClick={() => fileRef.current?.click()}>Change file</button></div>
        <nav className="matrix-steps" aria-label="Import steps"><button className={stage === 'mapping' ? 'active' : ''} onClick={() => setStage('mapping')}><span>1</span>Sheets & columns</button><Icon name="chevron-right" size={16} /><button className={stage === 'review' ? 'active' : ''} disabled={!included.length || !anyMapping} onClick={() => { setStage('review'); setPage(0) }}><span>2</span>Review & import</button></nav>
        {stage === 'mapping' ? <>
          <div className="matrix-section-title"><h3>Choose sheets</h3><button className="matrix-text-button" onClick={() => { setIncluded(layouts.flatMap((l, i) => l.detected && !book.sheets[i].hidden ? [i] : [])); setSelection({}) }}>Select detected matrices</button></div>
          <div className="matrix-sheets">{book.sheets.map((s, i) => <label key={s.name} className={included.includes(i) ? 'included' : ''}><input type="checkbox" checked={included.includes(i)} onChange={e => { setIncluded(prev => e.target.checked ? [...prev, i].sort((a, b) => a - b) : prev.filter(n => n !== i)); setSelection({}); if (e.target.checked) setActive(i) }} /><span>{s.name}<small>{s.hidden ? 'Hidden sheet' : layouts[i].detected ? 'Matrix detected' : 'Check mapping'}</small></span></label>)}</div>
          <div className="matrix-section-title"><h3>Map columns</h3><span>Suggestions use header keywords. Check each selected sheet.</span></div>
          <div className="matrix-mapping-controls">
            <Field label="Sheet to configure"><select value={active} onChange={e => setActive(Number(e.target.value))}>{book.sheets.map((s, i) => <option key={s.name} value={i}>{included.includes(i) ? '✓ ' : ''}{s.name}</option>)}</select></Field>
            <Field label="Header starts at row"><input type="number" min="1" max={Math.max(1, sheet!.rows.length)} value={config.headerRow + 1} onChange={e => updateHeader(Math.min(Math.max(0, Number(e.target.value) - 1), Math.max(0, sheet!.rows.length - 1)), config.headerDepth)} /></Field>
            <Field label="Header rows"><select value={config.headerDepth} onChange={e => updateHeader(config.headerRow, Number(e.target.value))}><option value="1">1 row</option><option value="2">2 rows</option><option value="3">3 rows</option></select></Field>
            <button className="button secondary" onClick={() => updateConfig(layouts[active])}>Reset suggestions</button>
          </div>
          {!included.includes(active) && <p className="matrix-hint">This sheet is not selected for import. Select it above to include its rows.</p>}
          <div className="matrix-table-wrap mapping-table-wrap"><table className="matrix-table mapping-table"><thead><tr><th>Column</th><th>Header in file</th><th>Sample value</th><th>Use as</th></tr></thead><tbody>{headers.map((h, c) => {
            const sample = sheet!.rows.slice(config.headerRow + config.headerDepth).find(r => r[c]?.trim())?.[c] || '—'
            return <tr key={c}><td>{columnLetter(c)}</td><td>{h || <span className="matrix-muted">No heading</span>}</td><td><span className="matrix-sample" title={sample}>{sample.slice(0, 180)}</span></td><td><select aria-label={`Map column ${columnLetter(c)}`} value={config.mapping[c] || 'ignore'} onChange={e => { const mapping = [...config.mapping]; mapping[c] = e.target.value as MatrixRole; updateConfig({ ...config, mapping }) }}>{matrixRoles.map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></td></tr>
          })}</tbody></table></div>
          <p className="matrix-hint">Multiple columns can use the same role. NAT columns are ignored by default. Each sheet keeps its own mapping; changing it clears that sheet’s row edits.</p>
        </> : null}

        <section className="matrix-options" aria-label="Extraction options">
          <div className="matrix-filter-row"><Field label="Filter rows by keywords" hint="Search all cells, sheet names and section headings. Separate keywords with commas; leave blank for all rows."><input placeholder="e.g. production, web, 192.0.2." value={keywords} onChange={e => { setKeywords(e.target.value); setAllowPartial(false); setPage(0) }} /></Field><Field label="Match"><select value={matchAll ? 'all' : 'any'} onChange={e => { setMatchAll(e.target.value === 'all'); setAllowPartial(false); setPage(0) }}><option value="any">Any keyword</option><option value="all">All keywords</option></select></Field></div>
          <div className="matrix-options-row"><fieldset><legend>Extract objects</legend>{([['sources', 'Source addresses'], ['destinations', 'Destination addresses'], ['services', 'TCP / UDP services']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={options[key]} onChange={e => changeOptions({ ...options, [key]: e.target.checked })} />{label}</label>)}</fieldset><Field label="When protocol is missing"><select value={options.missingProtocol} onChange={e => changeOptions({ ...options, missingProtocol: e.target.value as MatrixOptions['missingProtocol'] })}><option value="">Flag for review</option><option value="tcp">Use TCP</option><option value="udp">Use UDP</option></select></Field><Field label="Object names"><select value={options.useNames ? 'mapped' : 'generated'} onChange={e => changeOptions({ ...options, useNames: e.target.value === 'mapped' })}><option value="generated">Generate from IP / port</option><option value="mapped">Use mapped name columns</option></select></Field></div>
          <p className="matrix-hint">Creates address and TCP/UDP service objects. ICMP, security rules, NAT policies and groups need separate configuration. Service names such as “HTTPS” need explicit ports and protocol.</p>
          {formulaCount > 0 && <p className="matrix-hint">{formulaCount} formula cells: saved results are read as data. Formulas, macros and external links are not executed; recalculate and save the workbook first if results are outdated.</p>}
        </section>

        {stage === 'review' && <>
          <div className="matrix-stats"><div><strong>{matching.length}</strong><span>Matching rows / {rows.length} total</span></div><div><strong>{issues}</strong><span>Rows needing review</span></div><div><strong>{plan.addresses.length}</strong><span>New addresses</span></div><div><strong>{plan.services.length}</strong><span>New services</span></div><div><strong>{reused}</strong><span>Existing objects reused</span></div></div>
          <div className="matrix-review-toolbar"><div><button className="button secondary" onClick={selectClean}>Select clean rows</button><button className="matrix-text-button" onClick={() => setSelection(Object.fromEntries(matching.map(r => [r.id, false])))}>Deselect all</button></div><label><input type="checkbox" checked={onlyIssues} onChange={e => { setOnlyIssues(e.target.checked); setPage(0) }} />Show only rows with issues</label></div>
          <p className="matrix-hint">{selected.length} rows selected. Rows with issues start unselected. Expand a row to correct its extracted values; your file is unchanged. Import uses selected rows matching the keyword filter.</p>
          <div className="matrix-review-list">{visibleRows.map(row => <article className={`matrix-review-row ${row.issues.length ? 'has-issues' : ''}`} key={row.id}>
            <div className="matrix-row-summary"><input type="checkbox" aria-label={`Select ${row.sheet} row ${row.row}`} checked={isSelected(row)} disabled={!hasValues(row)} onChange={e => { setSelection(current => ({ ...current, [row.id]: e.target.checked })); setAllowPartial(false) }} /><button className="matrix-row-expand" aria-expanded={expanded === row.id} onClick={() => setExpanded(expanded === row.id ? null : row.id)}><div><strong>{row.sheet} <span>· Row {row.row}</span></strong><small>{row.context || `${row.sources.length + row.destinations.length} address values · ${row.services.length} service values`}</small></div><span className={`matrix-status ${row.issues.length ? 'issue' : ''}`}>{row.issues.length ? `${row.issues.length} ${row.issues.length === 1 ? 'issue' : 'issues'}` : 'Ready'}</span><Icon name={expanded === row.id ? 'chevron-left' : 'chevron-right'} size={17} /></button></div>
            <div className="matrix-row-values">{options.sources && <div><small>SOURCE</small><span>{row.fields.source || '—'}</span></div>}{options.destinations && <div><small>DESTINATION</small><span>{row.fields.destination || '—'}</span></div>}{options.services && <div><small>PORTS / PROTOCOL</small><span>{[row.fields.ports, row.fields.protocol].filter(Boolean).join(' · ') || '—'}</span></div>}</div>
            {expanded === row.id && <div className="matrix-row-detail">
              {!!row.issues.length && <ul className="matrix-row-issues">{row.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
              <div className="matrix-row-editor">{matrixRoles.filter(([role]) => role !== 'ignore' && (options.sources || !['source', 'sourceName'].includes(role)) && (options.destinations || !['destination', 'destinationName'].includes(role)) && (options.services || !['ports', 'protocol', 'sourcePorts', 'serviceName'].includes(role))).map(([role, label]) => <Field key={role} label={label}><textarea aria-label={`${label} for ${row.id}`} rows={2} value={row.fields[role as keyof RowFields]} onChange={e => editField(row, role as keyof RowFields, e.target.value)} /></Field>)}</div>
              <p className="matrix-hint">Recognized: {[...row.sources, ...row.destinations].map(v => v.value).concat(row.services.map(s => `${s.protocol.toUpperCase()} ${s.ports}${s.sourcePorts ? ` (source ${s.sourcePorts})` : ''}`)).join(' · ') || 'No supported values yet.'}</p>
              {edits[row.id] && <button className="matrix-text-button" onClick={() => { setEdits(current => { const next = { ...current }; delete next[row.id]; return next }); setSelection(current => ({ ...current, [row.id]: false })); setAllowPartial(false) }}>Restore values from file</button>}
            </div>}
          </article>)}{!reviewRows.length && <div className="matrix-empty">{rows.length ? 'No rows match this view. Adjust your keywords or turn off the issues filter.' : 'No data rows found. Check the selected sheets, header row and column mappings.'}</div>}</div>
          {reviewRows.length > PAGE_SIZE && <div className="matrix-pagination"><button className="button secondary" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {Math.ceil(reviewRows.length / PAGE_SIZE)}</span><button className="button secondary" disabled={(currentPage + 1) * PAGE_SIZE >= reviewRows.length} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
          {!!selectedIssues.length && <label className="matrix-partial"><input type="checkbox" checked={allowPartial} onChange={e => setAllowPartial(e.target.checked)} /><span>Import only the recognized values from {selectedIssues.length} selected {selectedIssues.length === 1 ? 'row' : 'rows'} with issues. Unresolved values will be skipped.</span></label>}
          <details className="matrix-object-preview"><summary>Object preview · {added} new / {reused} reused</summary><p className="matrix-hint">Repeated values are combined. Existing workspace objects are reused; name collisions receive a numbered suffix. New names use hyphens instead of spaces.</p>{!!plan.renamed.length && <p className="matrix-hint">Renamed: {plan.renamed.join(', ')}</p>}<div className="matrix-table-wrap"><table className="matrix-table"><thead><tr><th>Object name</th><th>Value</th><th>Status</th><th>From</th></tr></thead><tbody>{plan.items.slice(0, 200).map(item => <tr key={item.object.id}><td>{item.object.name}</td><td>{'value' in item.object ? item.object.value : `${item.object.protocol.toUpperCase()} ${item.object.ports}${item.object.sourcePorts ? ` / source ${item.object.sourcePorts}` : ''}`}</td><td>{item.existing ? 'Reuse' : 'New'}</td><td>{item.rows.join(', ')}</td></tr>)}</tbody></table></div>{plan.items.length > 200 && <p className="matrix-hint">Showing the first 200 of {plan.items.length} objects. All selected values are included in the import.</p>}</details>
        </>}
      </>}
    </div>
    <footer className="matrix-footer"><div><Icon name="lock" size={16} /><span>{book ? `${included.length} sheets selected · ${matching.length} matching rows` : 'Processed locally in your browser'}</span></div><div><button className="button secondary" onClick={stage === 'review' ? () => setStage('mapping') : onClose}>{stage === 'review' ? 'Back to mapping' : 'Cancel'}</button>{book && (stage === 'mapping' ? <button className="button primary" disabled={!included.length || !anyMapping || !(options.sources || options.destinations || options.services)} onClick={() => { setStage('review'); setPage(0) }}>Review {matching.length} rows<Icon name="chevron-right" size={17} /></button> : <button className="button primary" disabled={!added || (!!selectedIssues.length && !allowPartial)} onClick={() => onImport(plan)}><Icon name="plus" size={17} />Import {added} objects</button>)}</div></footer>
  </dialog>
}
