/**
 * Phase 76 PB-CSV-09: Build a downloadable error report CSV from failed import rows.
 *
 * Output format:
 *   - Header row = original `headers` + appended `error_reason` column
 *   - One data row per failed row, RFC 4180-escaped:
 *       - Cells containing `,`, `"`, `\r`, or `\n` are wrapped in double quotes
 *       - Embedded `"` is doubled (`""`)
 *   - No trailing newline
 *   - Empty `rows` → header-only single-line string
 *
 * Cell values are read from `row.values` by canonical field name. The `folder`
 * header is also accepted as an alias for `folder_name` (the wizard's canonical
 * key on `ImportRow`).
 */

import type { ImportRow } from './price-book-import'

export interface FailedRow {
  values: ImportRow
  reason: string
}

function escapeCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function buildErrorCsv(rows: FailedRow[], headers: string[]): string {
  const fullHeaders = [...headers, 'error_reason']
  const headerLine = fullHeaders.map(escapeCell).join(',')
  const dataLines = rows.map((r) => {
    const bag = r.values as Record<string, unknown>
    const cells = headers.map((h) => {
      // Accept `folder` as alias for the wizard's canonical `folder_name`
      if (h === 'folder' && bag['folder'] === undefined) return escapeCell(bag['folder_name'])
      return escapeCell(bag[h])
    })
    cells.push(escapeCell(r.reason))
    return cells.join(',')
  })
  return [headerLine, ...dataLines].join('\n')
}
