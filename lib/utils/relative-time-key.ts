import { formatDate } from '@/lib/utils/format-date'

/**
 * Relative time as a translatable template + value, so the caller can run the
 * template through t() and then fill `{n}` (t() does no interpolation).
 * Past a month it falls back to a short absolute date (`date`).
 */
export interface RelativeTimeParts {
  /** English template, a key in lib/i18n/client-activity-translations.ts. */
  key: 'just now' | '{n} min ago' | '{n}h ago' | '{n}d ago' | null
  n: number
  /** Short date, only set when `key` is null. */
  date: string
}

export function relativeTimeParts(iso: string, now: number = Date.now()): RelativeTimeParts {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return { key: null, n: 0, date: '' }
  const seconds = Math.max(0, Math.floor((now - then) / 1000))
  if (seconds < 60) return { key: 'just now', n: 0, date: '' }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return { key: '{n} min ago', n: minutes, date: '' }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { key: '{n}h ago', n: hours, date: '' }
  const days = Math.floor(hours / 24)
  if (days < 30) return { key: '{n}d ago', n: days, date: '' }
  return { key: null, n: 0, date: formatDate(iso, { month: 'short', day: 'numeric' }) }
}

/** Fill `{n}` / `{name}` placeholders. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m))
}
