// Pure view-model helpers for the analytics dashboard. No React, no i18n:
// everything user-visible is built by the components from these numbers.

import {
  READ_TO_END_PCT,
  type AnalyticsTimelineEntry,
  type AnalyticsVisit,
  type EstimateAnalytics,
} from '@/lib/estimate/analytics/contracts'
import { dayKey } from './format'

export const DAY_COUNT = 14

export interface DayBucket {
  /** Local midnight of the day. */
  date: Date
  key: string
  count: number
}

/**
 * Opens per local day for the last DAY_COUNT days ending today. When every
 * visit is older than that window, the window ends at the day of the last visit
 * instead, so the chart is never an empty row.
 */
export function buildDaySeries(visits: AnalyticsVisit[], now: Date = new Date()): DayBucket[] {
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const times = visits.map((v) => new Date(v.at).getTime()).filter((n) => Number.isFinite(n))
  if (times.length > 0) {
    const windowStart = new Date(end)
    windowStart.setDate(windowStart.getDate() - (DAY_COUNT - 1))
    const latest = Math.max(...times)
    if (latest < windowStart.getTime()) {
      const d = new Date(latest)
      end = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    }
  }
  const days: DayBucket[] = []
  for (let i = DAY_COUNT - 1; i >= 0; i--) {
    const date = new Date(end)
    date.setDate(end.getDate() - i)
    days.push({ date, key: dayKey(date.toISOString()), count: 0 })
  }
  const index = new Map(days.map((d, i) => [d.key, i]))
  for (const v of visits) {
    const i = index.get(dayKey(v.at))
    if (i != null) days[i].count += 1
  }
  return days
}

export type FunnelStepKey = 'opened' | 'half' | 'end' | 'signing' | 'answered'

export interface FunnelStep {
  key: FunnelStepKey
  count: number
}

export function buildFunnel(analytics: EstimateAnalytics, answered: boolean): FunnelStep[] {
  const { visits, summary } = analytics
  return [
    { key: 'opened', count: visits.length },
    { key: 'half', count: visits.filter((v) => v.maxScrollPct >= 50).length },
    { key: 'end', count: visits.filter((v) => v.maxScrollPct >= READ_TO_END_PCT).length },
    { key: 'signing', count: summary.signStarts },
    { key: 'answered', count: answered ? 1 : 0 },
  ]
}

export const STANDARD_SECTIONS = [
  'header',
  'line-items',
  'totals',
  'timeline',
  'terms',
  'signature',
  'photos',
  'prepared-by',
] as const

export interface ReadingRow {
  target: string
  seconds: number
  /** 1..4 = share of the longest section (quartiles); rows without reading time are left out. */
  bin: 0 | 1 | 2 | 3 | 4
}

/** Sections the client spent time on, in document order (then any unknown ones), binned by share of the max. */
export function buildReadingRows(sectionDwell: Record<string, number>): ReadingRow[] {
  const known = new Set<string>(STANDARD_SECTIONS)
  const extra = Object.keys(sectionDwell).filter((k) => !known.has(k) && sectionDwell[k] > 0)
  const order = [...STANDARD_SECTIONS, ...extra]
  const max = Math.max(0, ...order.map((k) => sectionDwell[k] ?? 0))
  return order.map((target) => {
    const seconds = sectionDwell[target] ?? 0
    let bin: ReadingRow['bin'] = 0
    if (seconds > 0 && max > 0) {
      const share = seconds / max
      bin = share > 0.75 ? 4 : share > 0.5 ? 3 : share > 0.25 ? 2 : 1
    }
    return { target, seconds, bin }
  }).filter((row) => row.seconds > 0)
}

export interface VisitorRow {
  index: number
  letter: string
  opens: number
  device: 'mobile' | 'desktop' | null
}

export function visitorLetter(index: number): string {
  return index >= 1 && index <= 26 ? String.fromCharCode(64 + index) : String(index)
}

export function buildVisitorRows(visits: AnalyticsVisit[]): VisitorRow[] {
  const byIndex = new Map<number, { opens: number; mobile: number; desktop: number }>()
  for (const v of visits) {
    const row = byIndex.get(v.visitorIndex) ?? { opens: 0, mobile: 0, desktop: 0 }
    row.opens += 1
    if (v.device === 'mobile') row.mobile += 1
    else if (v.device === 'desktop') row.desktop += 1
    byIndex.set(v.visitorIndex, row)
  }
  return Array.from(byIndex.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, r]) => ({
      index,
      letter: visitorLetter(index),
      opens: r.opens,
      device: r.mobile === 0 && r.desktop === 0 ? null : r.mobile > r.desktop ? 'mobile' : 'desktop',
    }))
}

export type Answer = { kind: 'accepted' | 'declined'; at: string }

/** The client's current answer: the newest accepted / declined entry not followed by a clear. */
export function currentAnswer(timeline: AnalyticsTimelineEntry[]): Answer | null {
  for (const entry of timeline) {
    if (entry.kind === 'accepted' || entry.kind === 'declined') return { kind: entry.kind, at: entry.at }
    if (entry.kind === 'response_cleared') return null
  }
  return null
}

export function topSection(dwell: Record<string, number>): string | null {
  let best: string | null = null
  let seconds = 0
  for (const [target, value] of Object.entries(dwell)) {
    if (value > seconds) {
      best = target
      seconds = value
    }
  }
  return best
}
