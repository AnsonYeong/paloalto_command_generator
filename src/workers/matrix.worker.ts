import { readMatrixWorkbook } from '../lib/matrixWorkbook'
import { defaultMatrixOptions, detectMatrixLayout, extractMatrixRows } from '../lib/matrix'

self.onmessage = (event: MessageEvent<{ data: ArrayBuffer; name: string }>) => {
  try {
    const book = readMatrixWorkbook(event.data.data, event.data.name)
    const layouts = book.sheets.map(sheet => {
      const layout = detectMatrixLayout(sheet)
      const hasBothAddresses = layout.mapping.includes('source') && layout.mapping.includes('destination')
      return { ...layout, detected: layout.detected && (hasBothAddresses || extractMatrixRows(sheet, layout, defaultMatrixOptions).some(r => r.sources.length || r.destinations.length)) }
    })
    self.postMessage({ book, layouts })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'The workbook could not be read. Try exporting it as XLSX or CSV.' })
  }
}
