/**
 * Phase 76 PB-CSV-04: Locale-aware currency parsing.
 *
 * Real-world spreadsheets mix US ("$1,234.56"), Brazilian ("R$ 1.234,56"),
 * plain ("1234.56"), and custom separator formats. This module:
 *   1. Detects the most likely locale from a sample of values (76-02).
 *   2. Parses a single value deterministically given a locale + optional override.
 *
 * Both functions are STUBs in this plan (76-01) so RED tests can resolve imports.
 * Full impl lands in 76-02.
 */

export type LocaleMode = 'us' | 'br' | 'plain' | 'custom'

export interface CustomLocale {
  decimal: string
  thousands: string
}

/**
 * STUB — full implementation lands in 76-02.
 *
 * Inspects up to N sample values (callers typically pass the first 5 numeric
 * cells) and returns the most likely locale. Heuristic:
 *   - Presence of `$` AND `.` before final 2 digits → 'us'
 *   - Presence of `R$` OR `.` thousands + `,` decimal → 'br'
 *   - Only digits/dot → 'plain'
 *   - Mixed/unknown → 'plain' (safest default)
 */
export function detectLocale(_samples: string[]): LocaleMode {
  throw new Error('NOT_IMPLEMENTED: detectLocale — implement in 76-02')
}

/**
 * STUB — full implementation lands in 76-02.
 *
 * Parses a single raw cell value into a number, given a locale mode.
 * Strips currency symbols (`$`, `R$`, `€`), surrounding quotes, and whitespace
 * before applying the locale-specific decimal/thousands separators. Returns
 * `null` for empty/whitespace-only or unparseable input (callers treat null as
 * `invalid_unit_price` for surfacing in the preview table).
 *
 * Rules:
 *   - Round to 2 decimals.
 *   - Negative values are returned as parsed (caller validates non-negativity).
 *   - `custom` is required when `mode === 'custom'`.
 */
export function parseCurrency(
  _raw: string,
  _mode: LocaleMode,
  _custom?: CustomLocale,
): number | null {
  throw new Error('NOT_IMPLEMENTED: parseCurrency — implement in 76-02')
}
