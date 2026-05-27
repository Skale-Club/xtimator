const FIXED_LOCALE = 'en-US'

/**
 * Hydration-safe date formatter. Pins locale to en-US and timeZone to UTC so
 * the server-rendered string and the first client render are always identical
 * (prevents React #418 hydration text mismatch). Mirror of the pinned-locale
 * pattern in lib/money/currency.ts.
 *
 * Default options reproduce the locale-less `toLocaleDateString()` US numeric
 * shape ("5/27/2026"). Callers wanting "May 27, 2026" pass
 * `{ month: 'short', day: 'numeric', year: 'numeric' }`. Invalid input returns
 * '' (matches the existing relative-time guards which return '' on NaN).
 */
export function formatDate(
  iso: string | number | Date,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric' },
): string {
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(FIXED_LOCALE, { timeZone: 'UTC', ...options }).format(d)
}
