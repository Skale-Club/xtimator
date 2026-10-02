// lib/estimate/document/format.ts
//
// ENGINE-01 — the ONE formatAddress/formatDate for all 4 renderers. This
// formatDate is the FIXED version (local-midnight normalization) — the
// other 3 pre-Phase-182 copies (estimate-document-modern.tsx,
// estimate-pdf.tsx, estimate-pdf-modern.tsx) call `new Date(dateStr)`
// directly, a dormant west-of-UTC off-by-one-day bug. All 4 surfaces adopt
// THIS version in Plan 182-02.

import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

export const DATE_LOCALE: Record<EstimateLanguage, string> = {
  en: 'en-US',
  pt: 'pt-BR',
  es: 'es-MX',
}

export function formatAddress(obj: {
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}): string | null {
  const parts: string[] = []
  if (obj.address) parts.push(obj.address)
  const cityState = [obj.city, obj.state].filter(Boolean).join(', ')
  if (cityState && obj.zip) parts.push(`${cityState} ${obj.zip}`)
  else if (cityState) parts.push(cityState)
  else if (obj.zip) parts.push(obj.zip)
  return parts.length > 0 ? parts.join('\n') : null
}

export function formatDate(dateStr: string, lang: EstimateLanguage = 'en'): string {
  const locale = DATE_LOCALE[lang] ?? 'en-US'
  // Date-only strings (YYYY-MM-DD) MUST parse as LOCAL midnight, not UTC.
  // `new Date('2026-07-08')` is UTC midnight, which renders as the PREVIOUS
  // day for any viewer west of UTC (and made the doc snapshot non-deterministic
  // in CI). Mirrors DatePopover's `${value}T00:00:00` convention.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T00:00:00` : dateStr
  return new Date(normalized).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * The estimate identifier shown after the "Estimate #" label on a document:
 * the user-facing `estimate_number` when set, otherwise the sequence zero-padded
 * to 4 digits ("0001"). ONE definition for the PDF info grid, the PDF compact
 * header (pages 2+) and the PDF footer, so the number can never read
 * differently in two places on the same document.
 */
export function formatEstimateNumber(estimate: { estimate_number: string | null; estimate_seq: number }): string {
  return estimate.estimate_number ?? String(estimate.estimate_seq).padStart(4, '0')
}

/**
 * Human-readable project type: `kitchen_remodel` -> `Kitchen Remodel`.
 * Matches what the web documents show today (`replace(/_/g, ' ')` + CSS
 * `capitalize`): underscores become spaces and the first letter of each word is
 * upper-cased. Like CSS `capitalize`, the rest of each word is left as-is (it
 * does NOT lower-case, so already-capitalised input is unchanged). Runs of
 * whitespace collapse to one space, as HTML rendering does on the web. Returns
 * null for null / blank input so callers can keep their `{value && ...}` guard.
 */
export function formatProjectType(raw: string | null): string | null {
  if (!raw) return null
  const text = raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return null
  return text.replace(/(^|\s)(\S)/g, (_m, sp: string, ch: string) => sp + ch.toUpperCase())
}

/**
 * ONE percent string for every surface (PDF, web Classic/Modern, print preview,
 * WhatsApp): up to 2 decimals, trailing zeros trimmed, "." as the decimal
 * separator. `value` is already in percent units (10 -> "10%", 8.25 -> "8.25%").
 * Callers holding a fraction (tax_rate 0.0825) multiply by 100 first; the
 * 2-decimal rounding also absorbs float noise (0.07 * 100 = 7.000000000000001).
 */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%'
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100
  // Avoid "-0%".
  const text = (Object.is(rounded, -0) ? 0 : rounded).toFixed(2).replace(/\.?0+$/, '')
  return `${text}%`
}
