import { describe, it, expect } from 'vitest'
import { buildDaySeries, buildReadingRows, currentAnswer } from '@/components/workspace/estimate/analytics/analytics-data'
import type { AnalyticsVisit } from '@/lib/estimate/analytics/contracts'

const visit = (at: Date): AnalyticsVisit => ({
  at: at.toISOString(),
  sessionId: at.toISOString(),
  visitorId: 'v',
  visitorIndex: 1,
  device: 'mobile',
  seconds: 0,
  maxScrollPct: 0,
  quick: true,
})

describe('buildDaySeries', () => {
  const now = new Date(2026, 10, 20, 15, 0, 0)

  it('returns 14 local days ending today and counts every visit', () => {
    const days = buildDaySeries([visit(new Date(2026, 10, 20, 9)), visit(new Date(2026, 10, 20, 10)), visit(new Date(2026, 10, 18, 23, 59))], now)
    expect(days).toHaveLength(14)
    expect(days[13].count).toBe(2)
    expect(days[11].count).toBe(1)
    expect(days[0].date.getDate()).toBe(7)
  })

  it('ends at the last visit day when every visit is older than 14 days', () => {
    const days = buildDaySeries([visit(new Date(2026, 9, 1, 12)), visit(new Date(2026, 9, 3, 12))], now)
    expect(days[13].date.getMonth()).toBe(9)
    expect(days[13].date.getDate()).toBe(3)
    expect(days[13].count).toBe(1)
    expect(days.reduce((n, d) => n + d.count, 0)).toBe(2)
  })
})

describe('buildReadingRows', () => {
  it('keeps document order and bins by share of the longest section', () => {
    const rows = buildReadingRows({ totals: 100, 'line-items': 60, header: 10 })
    expect(rows.map((r) => r.target).slice(0, 3)).toEqual(['header', 'line-items', 'totals'])
    expect(rows.find((r) => r.target === 'totals')?.bin).toBe(4)
    expect(rows.find((r) => r.target === 'line-items')?.bin).toBe(3)
    expect(rows.find((r) => r.target === 'header')?.bin).toBe(1)
    expect(rows.find((r) => r.target === 'photos')).toBeUndefined()
    expect(rows).toHaveLength(3)
  })
})

describe('currentAnswer', () => {
  it('ignores an answer that was cleared afterwards', () => {
    expect(currentAnswer([{ kind: 'response_cleared', at: '2' }, { kind: 'accepted', at: '1', signedOnline: false }])).toBeNull()
    expect(currentAnswer([{ kind: 'declined', at: '2' }])).toEqual({ kind: 'declined', at: '2' })
  })
})
