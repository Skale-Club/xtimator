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
