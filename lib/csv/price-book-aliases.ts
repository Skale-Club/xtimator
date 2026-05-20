/**
 * Phase 76 PB-CSV-02: Header alias dictionary + auto-mapping for CSV imports.
 *
 * The dictionary lists every spreadsheet header variant a non-technical contractor
 * might use (exported from QuickBooks, Excel, Google Sheets, etc.) and maps it to
 * a canonical target field on `company_price_book`.
 *
 * Implementation is split across two plans:
 *   - 76-01 (this file): dictionary + STUB matcher (RED tests pass against the throw).
 *   - 76-02: real `detectColumnMapping` impl that turns RED tests GREEN.
 */

export type TargetField = 'name' | 'unit_price' | 'folder' | 'unit' | 'notes'

/**
 * Alias dictionary. Keys are canonical target fields; values are the list of
 * lowercase, whitespace-trimmed spreadsheet headers that map to that field.
 *
 * Ordering matters for tie-breaks: when a header could match multiple fields,
 * `detectColumnMapping` (76-02) MUST prefer the field where the alias appears
 * earlier in this dictionary (e.g. `description` is in both `name` and `notes`,
 * but `name` wins because `name` is declared first).
 */
export const ALIAS_DICTIONARY: Record<TargetField, string[]> = {
  name: ['name', 'item', 'service', 'description', 'desc', 'product', 'line item'],
  unit_price: ['unit_price', 'price', 'cost', 'rate', 'amount', 'value', '$'],
  folder: ['folder', 'category', 'group', 'section', 'type'],
  unit: ['unit', 'uom', 'qty unit', 'measure', 'units of measure', 'measurement'],
  notes: ['notes', 'comments'],
}

/**
 * STUB — full implementation lands in 76-02.
 *
 * Returns a mapping from each CSV header to either a `TargetField` or `'_skip'`.
 * Inputs are normalized (lowercased + trimmed) before matching. When a single
 * header could match multiple fields, the field declared earlier in
 * `ALIAS_DICTIONARY` wins. Unknown headers map to `'_skip'`.
 */
export function detectColumnMapping(
  _headers: string[],
): Record<string, TargetField | '_skip'> {
  throw new Error('NOT_IMPLEMENTED: detectColumnMapping — implement in 76-02')
}
