import { describe, it, expect } from 'vitest'
import {
  aggregateEngagementSummary,
  aggregateViewTimeline,
  type EngagementEventRow,
} from '@/lib/queries/engagement'

// Phase 193 Plan 03 (Task 1) — pure aggregation math over fixture rows.
// These deliberately never touch Supabase: getEstimateEngagementSummary /
// getEstimateViewTimeline are thin fetch-then-aggregate wrappers around the
// two functions under test here.

function row(overrides: Partial<EngagementEventRow>): EngagementEventRow {
  return {
    id: overrides.id ?? Math.random().toString(36),
    estimate_id: 'est-1',
    company_id: 'co-1',
    visitor_id: 'visitor-1',
    session_id: 'session-1',
    event_type: 'view',
    target: null,
    x_pct: null,
    y_px: null,
    doc_h: null,
    viewport_w: null,
    device: null,
    metadata: null,
    created_at: '2026-08-20T10:00:00Z',
    ...overrides,
  }
}

describe('aggregateEngagementSummary', () => {
  it('returns all-zero summary for an empty event list', () => {
    const summary = aggregateEngagementSummary([])
    expect(summary).toEqual({
      opens: 0,
      uniqueVisitors: 0,
      lastViewedAt: null,
      totalSeconds: 0,
      maxScrollPct: 0,
      sectionsViewed: 0,
      clicks: 0,
      deviceSplit: { mobile: 0, desktop: 0, unknown: 0 },
      unlockFails: 0,
    })
  })

  it('counts opens, unique visitors (by visitor_id, not session), and the latest view time', () => {
    const rows: EngagementEventRow[] = [
      row({ event_type: 'view', visitor_id: 'v1', session_id: 's1', created_at: '2026-08-20T10:00:00Z', device: 'desktop' }),
      row({ event_type: 'view', visitor_id: 'v1', session_id: 's2', created_at: '2026-08-21T10:00:00Z', device: 'desktop' }),
      row({ event_type: 'view', visitor_id: 'v2', session_id: 's3', created_at: '2026-08-19T10:00:00Z', device: 'mobile' }),
    ]
    const summary = aggregateEngagementSummary(rows)
    expect(summary.opens).toBe(3)
    expect(summary.uniqueVisitors).toBe(2)
    expect(summary.lastViewedAt).toBe('2026-08-21T10:00:00Z')
    expect(summary.deviceSplit).toEqual({ mobile: 1, desktop: 2, unknown: 0 })
  })

  it('sums heartbeat seconds and takes the MAX scroll_depth pct, not a sum', () => {
    const rows: EngagementEventRow[] = [
      row({ event_type: 'heartbeat', metadata: { seconds: 5 } }),
      row({ event_type: 'heartbeat', metadata: { seconds: 12 } }),
      row({ event_type: 'scroll_depth', metadata: { pct: 40 } }),
      row({ event_type: 'scroll_depth', metadata: { pct: 90 } }),
      row({ event_type: 'scroll_depth', metadata: { pct: 65 } }),
    ]
    const summary = aggregateEngagementSummary(rows)
    expect(summary.totalSeconds).toBe(17)
    expect(summary.maxScrollPct).toBe(90)
  })

  it('counts distinct section_view targets and clicks, and unlock_fail rows', () => {
    const rows: EngagementEventRow[] = [
      row({ event_type: 'section_view', target: 'totals' }),
      row({ event_type: 'section_view', target: 'totals' }),
      row({ event_type: 'section_view', target: 'terms' }),
      row({ event_type: 'click', target: 'totals' }),
      row({ event_type: 'click', target: 'photos' }),
      row({ event_type: 'unlock_fail' }),
      row({ event_type: 'unlock_fail' }),
    ]
    const summary = aggregateEngagementSummary(rows)
    expect(summary.sectionsViewed).toBe(2)
    expect(summary.clicks).toBe(2)
    expect(summary.unlockFails).toBe(2)
  })

  it('ignores a malformed/missing metadata shape instead of throwing or NaN-poisoning the sum', () => {
    const rows: EngagementEventRow[] = [
      row({ event_type: 'heartbeat', metadata: {} }),
      row({ event_type: 'heartbeat', metadata: { seconds: 'not-a-number' } }),
      row({ event_type: 'heartbeat', metadata: null }),
      row({ event_type: 'heartbeat', metadata: { seconds: 8 } }),
    ]
    const summary = aggregateEngagementSummary(rows)
    expect(summary.totalSeconds).toBe(8)
  })
})

describe('aggregateViewTimeline', () => {
  it('returns an empty list for no events', () => {
    expect(aggregateViewTimeline([])).toEqual([])
  })

  it('rolls up per session_id: earliest created_at as startedAt, summed heartbeat seconds, max scroll pct', () => {
    const rows: EngagementEventRow[] = [
      row({ session_id: 's1', event_type: 'view', created_at: '2026-08-20T10:00:00Z', device: 'mobile' }),
      row({ session_id: 's1', event_type: 'heartbeat', created_at: '2026-08-20T10:00:05Z', metadata: { seconds: 10 } }),
      row({ session_id: 's1', event_type: 'heartbeat', created_at: '2026-08-20T10:00:15Z', metadata: { seconds: 10 } }),
      row({ session_id: 's1', event_type: 'scroll_depth', created_at: '2026-08-20T10:00:20Z', metadata: { pct: 55 } }),
      row({ session_id: 's2', event_type: 'view', created_at: '2026-08-21T09:00:00Z', device: 'desktop' }),
    ]
    const visits = aggregateViewTimeline(rows)
    expect(visits).toHaveLength(2)
    // Newest visit first.
    expect(visits[0].sessionId).toBe('s2')
    expect(visits[1]).toEqual({
      sessionId: 's1',
      startedAt: '2026-08-20T10:00:00Z',
      seconds: 20,
      device: 'mobile',
      maxScrollPct: 55,
    })
  })
})
