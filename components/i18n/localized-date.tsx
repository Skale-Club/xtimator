'use client'

import { useLanguage } from '@/lib/i18n/language-context'

const LOCALE = { en: 'en-US', pt: 'pt-BR', es: 'es-ES' } as const

/**
 * A date written in the app language ("Dec 8, 2026" / "8 de dez. de 2026"),
 * for server components that would otherwise format in English only.
 *
 * `variant`:
 *   medium - "Dec 8, 2026"
 *   short  - "Dec 8", plus the year only when it is not the current year
 * `utc` pins the calendar day to UTC (Stripe period ends, credit expiry).
 */
export function LocalizedDate({
  iso,
  variant = 'medium',
  utc = false,
}: {
  iso: string
  variant?: 'medium' | 'short'
  utc?: boolean
}) {
  const { language } = useLanguage()
  return <>{formatLocalizedDate(iso, language, variant, utc)}</>
}

export function formatLocalizedDate(
  iso: string,
  language: keyof typeof LOCALE,
  variant: 'medium' | 'short' = 'medium',
  utc = false,
  now = new Date(),
): string {
  const d = new Date(iso)
  const locale = LOCALE[language] ?? LOCALE.en
  const timeZone = utc ? 'UTC' : undefined
  if (variant === 'medium') return d.toLocaleDateString(locale, { dateStyle: 'medium', timeZone })
  const sameYear = utc
    ? d.getUTCFullYear() === now.getUTCFullYear()
    : d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone,
  })
}
