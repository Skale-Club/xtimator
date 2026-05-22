import { COUNTRIES, applyMask, maxDigits } from '@/lib/phone/countries'

/**
 * Region-aware phone formatter for display surfaces (currently: PDF only).
 *
 * - Empty/null/undefined → ''
 * - Strips non-digits, detects country by dial-code prefix (longest-first match),
 *   returns `+{dial} {masked}`.
 * - Unknown dial code → returns the raw input unchanged.
 *
 * NOTE: Do not apply this anywhere except components/pdf/estimate-pdf.tsx unless
 * scope is explicitly extended in a follow-up plan.
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

  // No dial match — return raw unchanged.
  return raw
}
