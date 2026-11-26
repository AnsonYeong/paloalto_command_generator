import { read, utils } from 'xlsx'
import type { MatrixBook, MatrixSheet } from './matrix.ts'

export const MAX_MATRIX_BYTES = 20 * 1024 * 1024
export function readMatrixWorkbook(data: ArrayBuffer, name: string): MatrixBook {
  if (!/\.(xlsx|xls|csv)$/i.test(name)) throw new Error('Choose an Excel (.xlsx or .xls) or CSV file.')
  if (!data.byteLength) throw new Error('This file is empty.')
  if (data.byteLength > MAX_MATRIX_BYTES) throw new Error('Choose a file smaller than 20 MB.')
  const workbook = read(data, { type: 'array', raw: true, cellFormula: true, cellHTML: false, cellText: false, cellStyles: false, bookVBA: false, bookDeps: false })
  if (workbook.SheetNames.length > 100) throw new Error('This workbook has more than 100 sheets. Export the sheets you need to a smaller workbook.')
  let cells = 0, characters = 0
  const sheets: MatrixSheet[] = workbook.SheetNames.map((sheetName, index) => {
    const source = workbook.Sheets[sheetName]
    const sheet: MatrixSheet = { name: sheetName, rows: [], merges: [], formulaCount: 0, hidden: !!workbook.Workbook?.Sheets?.[index]?.Hidden }
    for (const key of Object.keys(source)) {
      if (key.startsWith('!')) continue
      const cell = source[key]
      if (cell.f) sheet.formulaCount++
      const value = cell.v == null ? cell.f ? '[Formula has no cached value]' : '' : String(cell.v).trim()
      if (!value) continue
      const { r, c } = utils.decode_cell(key)
      if (r >= 50_000 || c >= 256 || ++cells > 500_000 || (characters += value.length) > 20_000_000) throw new Error('This workbook exceeds the import limit (50,000 rows per sheet, 256 columns, 500,000 populated cells or 20 million characters). Export a smaller selection.')
      sheet.rows[r] ||= []
      sheet.rows[r][c] = value
    }
    // Fill sparse arrays so row numbers remain the original Excel row numbers.
    sheet.rows = Array.from({ length: sheet.rows.length }, (_, r) => Array.from({ length: sheet.rows[r]?.length || 0 }, (_, c) => sheet.rows[r][c] || ''))
    sheet.merges = (source['!merges'] || []).filter(m => m.s.r < sheet.rows.length && m.s.c < 256).map(m => ({ startRow: m.s.r, endRow: Math.min(m.e.r, sheet.rows.length - 1), startColumn: m.s.c, endColumn: Math.min(m.e.c, 255) }))
    return sheet
  })
  if (!sheets.some(s => s.rows.length)) throw new Error('No populated cells were found in this file.')
  return { name, sheets }
}
