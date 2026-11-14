import { COUNTRIES, applyMask, maxDigits } from '@/lib/phone/countries'

/**
 * Region-aware phone formatter for display surfaces (estimate documents, PDF
 * and, since 2026-11-14, the Clients list and client page via formatClientPhone).
 *
 * - Empty/null/undefined → ''
 * - Strips non-digits, detects country by dial-code prefix (longest-first match),
 *   returns `+{dial} {masked}`.
 * - Unknown dial code → returns the raw input unchanged.
 *
 */
export function formatPhoneForDisplay(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''

  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return raw

  // Sort dial codes longest-first so '351' wins over '5', '55' wins over '5', etc.
  const sortedDials = [...new Set(COUNTRIES.map(c => c.dial))].sort(
    (a, b) => b.length - a.length,
  )

  for (const dial of sortedDials) {
    if (digits.startsWith(dial)) {
      // First country with this dial — US precedes CA in COUNTRIES so US wins for '1'.
      const country = COUNTRIES.find(c => c.dial === dial)!
      const localDigits = digits.slice(dial.length).slice(0, maxDigits(country.format))
      if (!localDigits) return raw // dial-only, no local part → don't fake a format
      return `+${dial} ${applyMask(localDigits, country.format)}`
    }
  }

  // Implicit-US fallback: raw 10-digit input with no leading '+' is overwhelmingly
  // a US number stored without country prefix (e.g. '5088018190' from a legacy form).
  if (!trimmed.startsWith('+') && digits.length === 10) {
    const us = COUNTRIES.find(c => c.code === 'US')!
    return `+${us.dial} ${applyMask(digits, us.format)}`
  }

  // No dial match — return raw unchanged.
  return raw
}

/**
 * Phone for the Clients screens: the display format without the "+1" of US
 * and Canadian numbers (the app's home market), so "+16175550105" reads
 * "(617) 555-0105"; other countries keep their dial code.
 */
export function formatClientPhone(raw: string | null | undefined): string {
  const formatted = formatPhoneForDisplay(raw)
  return formatted.startsWith('+1 ') ? formatted.slice(3) : formatted
}
