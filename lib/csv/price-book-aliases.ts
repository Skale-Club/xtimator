/**
 * Phase 76 PB-CSV-02: Header alias dictionary + auto-mapping for CSV imports.
 *
 * The dictionary lists every spreadsheet header variant a non-technical contractor
 * might use (exported from QuickBooks, Excel, Google Sheets, etc.) and maps it to
 * a canonical target field on `company_price_book`.
 */

export type TargetField = 'name' | 'unit_price' | 'folder' | 'unit' | 'notes'

/**
 * Alias dictionary. Keys are canonical target fields; values are the list of
 * lowercase, whitespace-trimmed spreadsheet headers that map to that field.
 *
 * Ordering matters for tie-breaks: when a header could match multiple fields,
 * `detectColumnMapping` prefers the field declared earlier in the priority
 * list (e.g. `description` is in both `name` and `notes`, but `name` wins).
 */
export const ALIAS_DICTIONARY: Record<TargetField, string[]> = {
  name: ['name', 'item', 'service', 'description', 'desc', 'product', 'line item'],
  unit_price: ['unit_price', 'price', 'cost', 'rate', 'amount', 'value', '$'],
  folder: ['folder', 'category', 'group', 'section', 'type'],
  unit: ['unit', 'uom', 'qty unit', 'measure', 'units of measure', 'measurement'],
  notes: ['notes', 'comments', 'description', 'desc'],
}

/** Priority order: earlier fields claim matching headers first. */
const PRIORITY: TargetField[] = ['name', 'unit_price', 'folder', 'unit', 'notes']

const normalize = (h: string): string => h.trim().toLowerCase()

/**
 * Returns a mapping from each CSV header (raw, as passed in) to either a
 * `TargetField` or `'_skip'`. Headers are matched case-insensitively and
 * whitespace-trimmed. When a single header could match multiple fields, the
 * field declared earlier in `PRIORITY` wins. Each target field is claimed by
 * at most one header (the first matching one in `headers` order). Unknown
 * headers map to `'_skip'`.
 */
export function detectColumnMapping(
  headers: string[],
): Record<string, TargetField | '_skip'> {
  const result: Record<string, TargetField | '_skip'> = {}
  const claimedTargets = new Set<TargetField>()

  for (const target of PRIORITY) {
    const aliases = ALIAS_DICTIONARY[target]
    for (const rawHeader of headers) {
      if (rawHeader in result) continue
      const norm = normalize(rawHeader)
      if (aliases.includes(norm) && !claimedTargets.has(target)) {
        result[rawHeader] = target
        claimedTargets.add(target)
        break
      }
    }
  }

  for (const h of headers) {
    if (!(h in result)) result[h] = '_skip'
  }

  return result
}
