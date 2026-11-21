import { describe, it, expect } from 'vitest'
import {
  buildEstimateAnalytics,
  type AnalyticsActivityRow,
  type AnalyticsEstimateInfo,
  type AnalyticsEventRow,
} from '@/lib/estimate/analytics/build'
import type { AnalyticsTimelineEntry, EngagementEventType } from '@/lib/estimate/analytics/contracts'

const NOW = new Date('2026-11-20T12:00:00.000Z')

const estimate: AnalyticsEstimateInfo = {
  created_at: '2026-11-01T10:00:00.000Z',
  sent_at: null,
  client_response: null,
  responded_at: null,
}

let n = 0
function ev(
  session: string,
  type: EngagementEventType,
  at: string,
  extra: Partial<AnalyticsEventRow> = {},
): AnalyticsEventRow {
  n += 1
  return {
    visitor_id: extra.visitor_id ?? 'v1',
    session_id: session,
    event_type: type,
    target: null,
    device: null,
    metadata: null,
    created_at: at,
    ...extra,
  }
}

/** A full reading session: view + heartbeats (seconds) + scroll + optional dwell. */
function visit(
  session: string,
  at: string,
  opts: { visitor?: string; device?: 'mobile' | 'desktop'; seconds?: number; pct?: number; dwell?: Record<string, number> } = {},
): AnalyticsEventRow[] {
  const visitor = opts.visitor ?? 'v1'
  const rows: AnalyticsEventRow[] = [ev(session, 'view', at, { visitor_id: visitor, device: opts.device ?? 'mobile' })]
  const base = new Date(at).getTime()
  if (opts.seconds) {
    rows.push(ev(session, 'heartbeat', new Date(base + 1000).toISOString(), { visitor_id: visitor, metadata: { seconds: opts.seconds } }))
  }
  if (opts.pct != null) {
    rows.push(ev(session, 'scroll_depth', new Date(base + 2000).toISOString(), { visitor_id: visitor, metadata: { pct: opts.pct } }))
  }
  for (const [target, seconds] of Object.entries(opts.dwell ?? {})) {
    rows.push(ev(session, 'section_view', new Date(base + 3000).toISOString(), { visitor_id: visitor, target, metadata: { dwell_seconds: seconds } }))
  }
  return rows
}

function build(events: AnalyticsEventRow[], activity: AnalyticsActivityRow[] = [], est = estimate) {
  return buildEstimateAnalytics({ events, activity, estimate: est, now: NOW })
}

function kinds(entries: AnalyticsTimelineEntry[]) {
  return entries.map((e) => e.kind)
}

describe('buildEstimateAnalytics', () => {
  it('handles no events: zero summary, interest none, only the created entry', () => {
    const r = build([])
    expect(r.summary.opens).toBe(0)
    expect(r.summary.uniqueVisitors).toBe(0)
    expect(r.summary.lastViewedAt).toBeNull()
    expect(r.summary.avgSecondsPerVisit).toBe(0)
    expect(r.interest.level).toBe('none')
    expect(r.timeline).toEqual([{ kind: 'created', at: estimate.created_at }])
  })

  it('builds one visit with device, seconds, scroll, top section and first flag', () => {
    const r = build(
      visit('s1', '2026-11-19T14:32:00.000Z', {
        device: 'mobile',
        seconds: 180,
        pct: 100,
        dwell: { totals: 60, header: 10, 'item:abc': 99 },
      }),
    )
    const v = r.timeline.find((e) => e.kind === 'visit')
    expect(v).toMatchObject({
      kind: 'visit',
      sessionId: 's1',
      visitorIndex: 1,
      device: 'mobile',
      seconds: 180,
      maxScrollPct: 100,
      topSection: 'totals',
      first: true,
    })
    expect(r.summary).toMatchObject({
      opens: 1,
      uniqueVisitors: 1,
      realVisits: 1,
      readToEndVisits: 1,
      totalSeconds: 180,
      avgSecondsPerVisit: 180,
      firstViewedAt: '2026-11-19T14:32:00.000Z',
      lastViewedAt: '2026-11-19T14:32:00.000Z',
    })
    // item dwell stays out of sections and is tracked separately
    expect(r.summary.sectionDwell).toEqual({ totals: 60, header: 10 })
    expect(r.summary.itemDwell).toEqual({ abc: 99 })
  })

  it('does not let item targets win the top section', () => {
    const r = build(visit('s1', '2026-11-19T14:32:00.000Z', { seconds: 60, pct: 60, dwell: { 'item:x': 500, terms: 5 } }))
    const v = r.timeline.find((e) => e.kind === 'visit')
    expect(v).toMatchObject({ topSection: 'terms' })
  })

  it('handles many visits: newest first, only the earliest is first, averages over real visits', () => {
    const events = [
      ...visit('s1', '2026-11-10T10:00:00.000Z', { seconds: 60, pct: 50 }),
      ...visit('s2', '2026-11-12T10:00:00.000Z', { seconds: 120, pct: 95 }),
      ...visit('s3', '2026-11-18T10:00:00.000Z', { seconds: 90, pct: 100 }),
    ]
    const r = build(events)
    const visitEntries = r.timeline.filter((e) => e.kind === 'visit')
    expect(visitEntries.map((e) => (e.kind === 'visit' ? e.sessionId : ''))).toEqual(['s3', 's2', 's1'])
    expect(visitEntries.map((e) => (e.kind === 'visit' ? e.first : null))).toEqual([false, false, true])
    expect(r.summary.opens).toBe(3)
    expect(r.summary.avgSecondsPerVisit).toBe(90)
    expect(r.summary.readToEndVisits).toBe(2)
    expect(r.summary.distinctVisitDays).toBe(3)
    expect(r.interest.level).toBe('hot')
    expect(r.interest.reasons).toContain('many_opens')
    expect(r.interest.reasons).toContain('came_back')
  })

  it('collapses consecutive quick opens into one entry', () => {
    const events = [
      ...visit('s1', '2026-11-10T10:00:00.000Z', { seconds: 2 }),
      ...visit('s2', '2026-11-10T11:00:00.000Z', { seconds: 4, pct: 20 }),
      ...visit('s3', '2026-11-10T12:00:00.000Z', { seconds: 0 }),
      ...visit('s4', '2026-11-11T09:00:00.000Z', { seconds: 100, pct: 80 }),
    ]
    const r = build(events)
    const quick = r.timeline.find((e) => e.kind === 'quick_opens')
    expect(quick).toMatchObject({ count: 3, at: '2026-11-10T12:00:00.000Z', since: '2026-11-10T10:00:00.000Z' })
    expect(r.summary.opens).toBe(4)
    expect(r.summary.realVisits).toBe(1)
    expect(r.summary.avgSecondsPerVisit).toBe(100)
    expect(kinds(r.timeline)).toEqual(['visit', 'quick_opens', 'created'])
  })

  it('files a quick-open run under the day of its LAST open, with since = first', () => {
    const r = build([
      ...visit('s1', '2026-11-16T23:31:00.000Z', { seconds: 1 }),
      ...visit('s2', '2026-11-17T22:12:00.000Z', { seconds: 2 }),
    ])
    const quick = r.timeline.find((e) => e.kind === 'quick_opens')
    expect(quick).toMatchObject({ count: 2, at: '2026-11-17T22:12:00.000Z', since: '2026-11-16T23:31:00.000Z' })
    expect(r.summary.lastViewedAt).toBe('2026-11-17T22:12:00.000Z')
  })

  it('exposes every visit, oldest first, with quick flag and visitor index', () => {
    const r = build([
      ...visit('s2', '2026-11-11T09:00:00.000Z', { seconds: 100, pct: 80, visitor: 'v2', device: 'desktop' }),
      ...visit('s1', '2026-11-10T10:00:00.000Z', { seconds: 2 }),
    ])
    expect(r.visits.map((v) => v.sessionId)).toEqual(['s1', 's2'])
    expect(r.visits[0]).toMatchObject({ quick: true, visitorIndex: 1, device: 'mobile', seconds: 2, visitorId: 'v1' })
    expect(r.visits[1]).toMatchObject({ quick: false, visitorIndex: 2, device: 'desktop', seconds: 100, maxScrollPct: 80 })
  })

  it('treats a short visit that scrolled far as a real visit', () => {
    const r = build(visit('s1', '2026-11-10T10:00:00.000Z', { seconds: 3, pct: 70 }))
    expect(r.summary.realVisits).toBe(1)
    expect(kinds(r.timeline)).toContain('visit')
  })

  it('splits a quick-open run when another entry sits between', () => {
    const events = [
      ...visit('s1', '2026-11-10T10:00:00.000Z', { seconds: 1 }),
      ev('s1', 'pdf_download', '2026-11-10T10:30:00.000Z'),
      ...visit('s2', '2026-11-10T11:00:00.000Z', { seconds: 1 }),
    ]
    const r = build(events)
    expect(kinds(r.timeline)).toEqual(['quick_opens', 'action', 'quick_opens', 'created'])
  })

  it('numbers visitors by first appearance and counts unique visitors', () => {
    const events = [
      ...visit('s1', '2026-11-10T10:00:00.000Z', { visitor: 'a', seconds: 40, pct: 40 }),
      ...visit('s2', '2026-11-11T10:00:00.000Z', { visitor: 'b', seconds: 40, pct: 40 }),
      ...visit('s3', '2026-11-12T10:00:00.000Z', { visitor: 'a', seconds: 40, pct: 40 }),
    ]
    const r = build(events)
    const idx = r.timeline.filter((e) => e.kind === 'visit').map((e) => (e.kind === 'visit' ? e.visitorIndex : 0))
    expect(idx).toEqual([1, 2, 1]) // newest first: s3 (a), s2 (b), s1 (a)
    expect(r.summary.uniqueVisitors).toBe(2)
    expect(r.interest.reasons).toContain('several_people')
  })

  it('splits devices from the view event, with unknown for sessions without one', () => {
    const events = [
      ...visit('s1', '2026-11-10T10:00:00.000Z', { device: 'mobile', seconds: 30, pct: 30 }),
      ...visit('s2', '2026-11-11T10:00:00.000Z', { device: 'desktop', seconds: 30, pct: 30 }),
      ev('s3', 'heartbeat', '2026-11-12T10:00:00.000Z', { metadata: { seconds: 30 } }),
    ]
    const r = build(events)
    expect(r.summary.deviceSplit).toEqual({ mobile: 1, desktop: 1, unknown: 1 })
  })

  it('maps sent channels (email, sms, whatsapp, link) with recipients', () => {
    const activity: AnalyticsActivityRow[] = [
      { event_type: 'estimate_sent', created_at: '2026-11-02T10:00:00.000Z', metadata: { channel: 'email', to: 'sophia@example.com' } },
      { event_type: 'estimate_sent', created_at: '2026-11-03T10:00:00.000Z', metadata: { channel: 'sms', to: '+15551234567' } },
      { event_type: 'estimate_sent', created_at: '2026-11-04T10:00:00.000Z', metadata: { channel: 'whatsapp' } },
      { event_type: 'estimate_marked_sent', created_at: '2026-11-05T10:00:00.000Z', metadata: { marked_manually: true } },
      { event_type: 'estimate_sent', created_at: '2026-11-06T10:00:00.000Z', metadata: { channel: 'carrier-pigeon' } },
    ]
    const sent = build([], activity).timeline.filter((e) => e.kind === 'sent')
    expect(sent).toEqual([
      { kind: 'sent', at: '2026-11-06T10:00:00.000Z', channel: 'other', to: null },
      { kind: 'sent', at: '2026-11-05T10:00:00.000Z', channel: 'link', to: null },
      { kind: 'sent', at: '2026-11-04T10:00:00.000Z', channel: 'whatsapp', to: null },
      { kind: 'sent', at: '2026-11-03T10:00:00.000Z', channel: 'sms', to: '+15551234567' },
      { kind: 'sent', at: '2026-11-02T10:00:00.000Z', channel: 'email', to: 'sophia@example.com' },
    ])
  })

  it('maps the other activity types and ignores unknown ones', () => {
    const activity: AnalyticsActivityRow[] = [
      { event_type: 'estimate_created_blank', created_at: '2026-11-01T09:00:00.000Z', metadata: null },
      { event_type: 'project_created', created_at: '2026-11-01T08:00:00.000Z', metadata: null },
      { event_type: 'estimate_generated', created_at: '2026-11-01T09:05:00.000Z', metadata: null },
      { event_type: 'estimate_updated', created_at: '2026-11-01T09:10:00.000Z', metadata: { total_delta: -250 } },
      { event_type: 'estimate_declined', created_at: '2026-11-08T09:00:00.000Z', metadata: { source: 'manual' } },
      { event_type: 'estimate_response_cleared', created_at: '2026-11-09T09:00:00.000Z', metadata: { source: 'manual' } },
      { event_type: 'estimate_accepted', created_at: '2026-11-10T09:00:00.000Z', metadata: { source: 'manual' } },
      { event_type: 'trade_mismatch_detected', created_at: '2026-11-01T09:01:00.000Z', metadata: null },
    ]
    const r = build([], activity, { ...estimate, sent_at: null })
    expect(kinds(r.timeline)).toEqual(['accepted', 'response_cleared', 'declined', 'updated', 'generated', 'created'])
    // one created entry, earliest wins
    expect(r.timeline.find((e) => e.kind === 'created')).toMatchObject({ at: '2026-11-01T08:00:00.000Z' })
    expect(r.timeline.find((e) => e.kind === 'updated')).toMatchObject({ totalDelta: -250 })
    expect(r.timeline.find((e) => e.kind === 'accepted')).toMatchObject({ signedOnline: false })
  })

  it('falls back to the estimate row for created, sent and accepted', () => {
    const r = build([], [], {
      created_at: '2026-11-01T10:00:00.000Z',
      sent_at: '2026-11-02T10:00:00.000Z',
      client_response: 'accepted',
      responded_at: '2026-11-05T10:00:00.000Z',
      signed_online: true,
    })
    expect(r.timeline).toEqual([
      { kind: 'accepted', at: '2026-11-05T10:00:00.000Z', signedOnline: true },
      { kind: 'sent', at: '2026-11-02T10:00:00.000Z', channel: 'other', to: null },
      { kind: 'created', at: '2026-11-01T10:00:00.000Z' },
    ])
    // accepted means past the interest question
    expect(r.interest.level).toBe('none')
  })

  it('falls back to a declined row when only the estimate says declined', () => {
    const r = build([], [], { ...estimate, client_response: 'declined', responded_at: '2026-11-06T10:00:00.000Z' })
    expect(r.timeline[0]).toEqual({ kind: 'declined', at: '2026-11-06T10:00:00.000Z' })
  })

  it('does not duplicate sent / accepted when the activity log has them', () => {
    const r = build(
      [],
      [
        { event_type: 'estimate_marked_sent', created_at: '2026-11-02T10:00:00.000Z', metadata: null },
        { event_type: 'estimate_accepted', created_at: '2026-11-05T10:00:00.000Z', metadata: {} },
      ],
      { ...estimate, sent_at: '2026-11-02T10:00:00.000Z', client_response: 'accepted', responded_at: '2026-11-05T10:00:00.000Z', signed_online: true },
    )
    expect(kinds(r.timeline)).toEqual(['accepted', 'sent', 'created'])
    expect(r.timeline[0]).toMatchObject({ signedOnline: true })
  })

  it('turns the new action events into action entries and counts', () => {
    const events = [
      ...visit('s1', '2026-11-19T14:00:00.000Z', { seconds: 60, pct: 60 }),
      ev('s1', 'pdf_download', '2026-11-19T14:05:00.000Z'),
      ev('s1', 'print', '2026-11-19T14:06:00.000Z'),
      ev('s1', 'sign_start', '2026-11-19T14:07:00.000Z'),
      ev('s1', 'contact_click', '2026-11-19T14:08:00.000Z', { target: 'phone' }),
      ev('s1', 'contact_click', '2026-11-19T14:09:00.000Z', { target: 'email' }),
    ]
    const r = build(events)
    expect(r.summary).toMatchObject({ pdfDownloads: 1, prints: 1, signStarts: 1, contactClicks: 2 })
    const actions = r.timeline.filter((e) => e.kind === 'action')
    expect(actions).toHaveLength(5)
    expect(actions[0]).toMatchObject({ action: 'contact_click', target: 'email', at: '2026-11-19T14:09:00.000Z' })
    expect(r.interest.level).toBe('hot')
    expect(r.interest.reasons).toContain('started_signing')
    expect(r.interest.reasons).toContain('downloaded_pdf')
  })

  it('does not count an action-only or unlock_fail-only session as an open', () => {
    const r = build([ev('s9', 'unlock_fail', '2026-11-19T10:00:00.000Z'), ev('s9', 'pdf_download', '2026-11-19T10:01:00.000Z')])
    expect(r.summary.opens).toBe(0)
    expect(r.summary.unlockFails).toBe(1)
    expect(r.summary.pdfDownloads).toBe(1)
  })

  it('counts clicks and tolerates missing or junk metadata', () => {
    const events = [
      ...visit('s1', '2026-11-19T10:00:00.000Z', { seconds: 30, pct: 30 }),
      ev('s1', 'click', '2026-11-19T10:00:10.000Z'),
      ev('s1', 'heartbeat', '2026-11-19T10:00:20.000Z', { metadata: { seconds: 'abc' } }),
      ev('s1', 'heartbeat', '2026-11-19T10:00:30.000Z', { metadata: null }),
      ev('s1', 'scroll_depth', '2026-11-19T10:00:40.000Z', { metadata: { pct: '75' } }),
    ]
    const r = build(events)
    expect(r.summary.clicks).toBe(1)
    expect(r.summary.totalSeconds).toBe(30)
    expect(r.timeline.find((e) => e.kind === 'visit')).toMatchObject({ maxScrollPct: 75 })
  })

  it('orders a mixed timeline newest first', () => {
    const r = build(
      visit('s1', '2026-11-12T10:00:00.000Z', { seconds: 60, pct: 60 }),
      [
        { event_type: 'estimate_sent', created_at: '2026-11-11T10:00:00.000Z', metadata: { channel: 'email', to: 'a@b.co' } },
        { event_type: 'estimate_updated', created_at: '2026-11-13T10:00:00.000Z', metadata: null },
      ],
    )
    expect(kinds(r.timeline)).toEqual(['updated', 'visit', 'sent', 'created'])
  })

  it('uses estimate.last_viewed_at only when no visit rows exist', () => {
    const none = build([], [], { ...estimate, last_viewed_at: '2026-11-15T10:00:00.000Z' })
    expect(none.summary.lastViewedAt).toBe('2026-11-15T10:00:00.000Z')
    const some = build(visit('s1', '2026-11-18T10:00:00.000Z', { seconds: 30, pct: 30 }), [], {
      ...estimate,
      last_viewed_at: '2026-11-15T10:00:00.000Z',
    })
    expect(some.summary.lastViewedAt).toBe('2026-11-18T10:00:00.000Z')
  })

  it('marks an estimate with no visits for a week as cold', () => {
    const r = build(visit('s1', '2026-11-05T10:00:00.000Z', { seconds: 30, pct: 30 }))
    expect(r.interest.level).toBe('cold')
    expect(r.interest.reasons[0]).toBe('gone_quiet')
  })
})
