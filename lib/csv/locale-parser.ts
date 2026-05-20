/**
 * Phase 76 PB-CSV-04: Locale-aware currency parsing.
 *
 * Real-world spreadsheets mix US ("$1,234.56"), Brazilian ("R$ 1.234,56"),
 * plain ("1234.56"), and custom separator formats. This module:
 *   1. Detects the most likely locale from a sample of values.
 *   2. Parses a single value deterministically given a locale + optional override.
 */

export type LocaleMode = 'us' | 'br' | 'plain' | 'custom'

export interface CustomLocale {
  decimal: string
  thousands: string
}

// Strip common currency symbols. Order matters: "R$" before standalone "$".
const SYMBOL_RE = /R\$|[$€£¥]/g

function stripSymbolsAndQuotes(raw: string): string {
  let s = raw.trim()
  // Strip a single layer of surrounding quotes (single or double).
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1)
  }
  s = s.replace(SYMBOL_RE, '').trim()
  return s
}

/**
 * Inspects up to 5 sample values and returns the most likely locale.
 *
 *   - US: thousands grouped by `,` then `.` decimal (e.g. `1,234.56`)
 *   - BR: thousands grouped by `.` then `,` decimal (e.g. `1.234,56` or `99,00`)
 *   - Plain: bare digits with optional `.` decimal (e.g. `1234.56`)
 *   - Mixed/unknown → 'plain' (safe default).
 */
export function detectLocale(samples: string[]): LocaleMode {
  let usScore = 0
  let brScore = 0
  let plainScore = 0

  for (const raw of samples.slice(0, 5)) {
    const s = stripSymbolsAndQuotes(raw).replace(/\s/g, '')
    if (!s) continue
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
      usScore++
    } else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
      brScore++
    } else if (/^-?\d+,\d+$/.test(s)) {
      // "99,00" — BR-style comma decimal w/out thousands
      brScore++
    } else if (/^-?\d+(\.\d+)?$/.test(s)) {
      plainScore++
    }
  }

  if (brScore > usScore && brScore >= plainScore) return 'br'
  if (usScore > 0 && usScore >= brScore) return 'us'
  if (plainScore > 0) return 'plain'
  return 'plain'
}

/**
 * Parses a single raw cell value into a number, given a locale mode.
 * Strips currency symbols (`$`, `R$`, `€`, `£`, `¥`), surrounding quotes, and
 * whitespace before applying the locale-specific decimal/thousands separators.
 * Returns `null` for empty/whitespace-only or unparseable input.
 *
 * Rules:
 *   - Round to 2 decimals.
 *   - Negative values are returned as parsed (caller validates non-negativity).
 *   - `custom` is required when `mode === 'custom'`.
 */
export function parseCurrency(
  raw: string,
  mode: LocaleMode,
  custom?: CustomLocale,
): number | null {
  if (!raw || !raw.trim()) return null
  let s = stripSymbolsAndQuotes(raw).replace(/\s/g, '')
  if (!s) return null

  switch (mode) {
    case 'us':
      // Remove thousands separators (commas), keep decimal point.
      s = s.replace(/,/g, '')
      break
    case 'br':
      // Remove `.` thousands, then convert `,` decimal to `.`.
      s = s.replace(/\./g, '').replace(/,/g, '.')
      break
    case 'plain':
      // Leave as-is — bare number.
      break
    case 'custom': {
      if (!custom) return null
      if (custom.thousands) s = s.split(custom.thousands).join('')
      if (custom.decimal && custom.decimal !== '.') {
        s = s.split(custom.decimal).join('.')
      }
      break
    }
  }

  const n = Number(s)
  if (Number.isNaN(n) || !Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}
