// Presentation helpers for the analytics drawer. Pure; every user-visible
// fragment goes through the `t` passed in, and numbers are interpolated into
// the translated template (never pushed through t() as part of the string).

export type TFn = (source: string) => string

/** Replace `{name}` placeholders in an already-translated template. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match))
}

/** 45s, 3m 00s, 1h 05m. Digits and fixed separators only: no translation needed. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  if (seconds < 60) return `${seconds}s`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  return `${minutes}m ${String(secs).padStart(2, '0')}s`
}

function validDate(iso: string): Date | null {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "just now", "12 min ago", "3 h ago", "12 days ago"; older than 30 days: the short date. */
export function relativeAgo(iso: string, t: TFn, now: Date = new Date()): string {
  const d = validDate(iso)
  if (!d) return ''
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (seconds < 60) return t('just now')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return fill(t('{n} min ago'), { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return fill(t('{n} h ago'), { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return fill(t(days === 1 ? '{n} day ago' : '{n} days ago'), { n: days })
  return shortDate(iso)
}

export function shortDate(iso: string): string {
  const d = validDate(iso)
  return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
}

/** 2:32 PM (locale clock). */
export function clockTime(iso: string): string {
  const d = validDate(iso)
  return d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''
}

/** Nov 8, 2:32 PM. */
export function exactDateTime(iso: string): string {
  const d = validDate(iso)
  return d
    ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : ''
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function dayKey(iso: string): string {
  const d = validDate(iso)
  return d ? localDayKey(d) : iso
}

/** Today / Yesterday / short date. */
export function dayLabel(iso: string, t: TFn, now: Date = new Date()): string {
  const d = validDate(iso)
  if (!d) return ''
  if (localDayKey(d) === localDayKey(now)) return t('Today')
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (localDayKey(d) === localDayKey(yesterday)) return t('Yesterday')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

/** Human labels for the share page's tracked sections (English sources for t()). */
export const SECTION_LABELS: Record<string, string> = {
  header: 'Header',
  'line-items': 'Line items',
  totals: 'Totals',
  terms: 'Terms',
  timeline: 'Timeline',
  signature: 'Signature',
  photos: 'Photos',
  'prepared-by': 'Prepared by',
}

export function sectionLabel(target: string, t: TFn): string {
  return t(SECTION_LABELS[target] ?? target)
}
