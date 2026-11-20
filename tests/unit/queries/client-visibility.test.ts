import { describe, it, expect } from 'vitest'
import {
  indexEstimateListStatuses,
  signalsFromEvents,
  toEstimateListStatus,
  withEstimateStatus,
} from '@/lib/queries/estimate-list-status'
import { buildClientActivity, foldRepeatedOpens, type ClientActivityEstimate, type ClientActivityRow } from '@/lib/queries/client-activity'
import { relativeTimeParts, fillTemplate } from '@/lib/utils/relative-time-key'
import { clientActivityTranslations } from '@/lib/i18n/client-activity-translations'

const NOW = new Date('2026-11-20T12:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const H = 3_600_000

describe('toEstimateListStatus', () => {
  const base = { sent_at: null, view_count: 0, last_viewed_at: null, client_response: null, responded_at: null }

  it('is draft with no send and no views', () => {
    const s = toEstimateListStatus(base, NOW)
    expect(s.state).toBe('draft')
    expect(s.hot).toBe(false)
    expect(s.openedNoAnswer).toBe(false)
    expect(s.lastActivityAt).toBeNull()
  })

  it('counts views as sent and flags opened-no-answer', () => {
    const s = toEstimateListStatus({ ...base, view_count: 1, last_viewed_at: ago(2 * H) }, NOW)
    expect(s.state).toBe('sent')
    expect(s.views).toBe(1)
    expect(s.openedNoAnswer).toBe(true)
    expect(s.lastActivityAt).toBe(ago(2 * H))
  })

  it('is sent (not opened) when only sent_at is set', () => {
    const s = toEstimateListStatus({ ...base, sent_at: ago(5 * H) }, NOW)
    expect(s.state).toBe('sent')
    expect(s.openedNoAnswer).toBe(false)
  })

  it('counters alone are only warm; event signals make it hot', () => {
    const row = { ...base, sent_at: ago(30 * H), view_count: 4, last_viewed_at: ago(H) }
    expect(toEstimateListStatus(row, NOW).hot).toBe(false)
    const sig = { uniqueVisitors: 2, distinctVisitDays: 1, signStarts: 0, pdfDownloads: 0, prints: 0 }
    const s = toEstimateListStatus(row, NOW, sig)
    expect(s.hot).toBe(true)
    expect(s.hotReasons).toContain('many_opens')
    expect(s.hotReasons.length).toBeLessThanOrEqual(3)
  })

  it('accepted / declined win and are never hot; activity uses the later time', () => {
    const accepted = toEstimateListStatus(
      { ...base, view_count: 5, last_viewed_at: ago(3 * H), client_response: 'accepted', responded_at: ago(H) },
      NOW,
    )
    expect(accepted.state).toBe('accepted')
    expect(accepted.hot).toBe(false)
    expect(accepted.openedNoAnswer).toBe(false)
    expect(accepted.lastActivityAt).toBe(ago(H))
    expect(toEstimateListStatus({ ...base, client_response: 'declined' }, NOW).state).toBe('declined')
  })
})

describe('signalsFromEvents', () => {
  it('folds events into per-estimate signals', () => {
    const e = (event_type: string, visitor_id: string, at: string) => ({ estimate_id: 'e1', visitor_id, event_type, created_at: at })
    const sig = signalsFromEvents([
      e('view', 'v1', '2026-11-18T10:00:00Z'),
      e('view', 'v1', '2026-11-19T10:00:00Z'),
      e('view', 'v2', '2026-11-19T11:00:00Z'),
      e('pdf_download', 'v1', '2026-11-19T10:05:00Z'),
      e('print', 'v1', '2026-11-19T10:06:00Z'),
      e('sign_start', 'v2', '2026-11-19T11:05:00Z'),
    ]).e1
    expect(sig).toEqual({ uniqueVisitors: 2, distinctVisitDays: 2, signStarts: 1, pdfDownloads: 1, prints: 1 })
  })
})

describe('indexEstimateListStatuses / withEstimateStatus', () => {
  it('indexes by project (first row wins) and attaches to rows', () => {
    const idx = indexEstimateListStatuses(
      [
        { project_id: 'p1', sent_at: ago(H), view_count: 0, last_viewed_at: null, client_response: null, responded_at: null },
        { project_id: 'p1', sent_at: null, view_count: 9, last_viewed_at: ago(H), client_response: null, responded_at: null },
      ],
      NOW,
    )
    expect(Object.keys(idx)).toEqual(['p1'])
    expect(idx.p1.views).toBe(0)
    const merged = withEstimateStatus([{ id: 'p1' }, { id: 'p2' }], idx)
    expect(merged[0].estimate_status?.state).toBe('sent')
    expect(merged[1].estimate_status).toBeUndefined()
  })
})

describe('buildClientActivity', () => {
  const estimates: Record<string, ClientActivityEstimate> = {
    e1: { projectId: 'p1', projectName: 'Bi-weekly Cleaning', clientName: 'Sophia Chen', viewCount: 4, lastViewedAt: ago(H), clientResponse: null },
    e2: { projectId: 'p2', projectName: 'Deck', clientName: null, viewCount: 1, lastViewedAt: ago(2 * H), clientResponse: null },
  }
  const ev = (id: string, estimate_id: string, session_id: string, event_type: string, at: string, device: 'mobile' | 'desktop' | null = 'mobile') => ({
    id, estimate_id, session_id, event_type, device, created_at: at,
  })

  it('merges events and answers newest first, one open per session', () => {
    const rows = buildClientActivity({
      events: [
        ev('a', 'e1', 's1', 'view', ago(10 * 60_000)),
        ev('b', 'e1', 's1', 'view', ago(9 * 60_000)), // same session: dropped
        ev('c', 'e1', 's1', 'pdf_download', ago(8 * 60_000)),
        ev('d', 'e2', 's2', 'view', ago(5 * 60_000), 'desktop'),
        ev('x', 'e1', 's1', 'heartbeat', ago(7 * 60_000)), // not an action
      ],
      responses: [
        { id: 'r1', estimate_id: 'e1', event_type: 'estimate_accepted', created_at: ago(60_000), metadata: {} },
        { id: 'r2', estimate_id: 'e2', event_type: 'estimate_declined', created_at: ago(30_000), metadata: { source: 'manual' } },
      ],
      estimates,
      now: NOW,
    })
    expect(rows.map((r) => `${r.kind}:${r.projectId}`)).toEqual([
      'accepted:p1',
      'opened:p2',
      'pdf_download:p1',
      'opened:p1',
    ])
    expect(rows[1].device).toBe('desktop')
    expect(rows[1].clientName).toBeNull()
    // e1 has 4 recent opens: hot on its activity rows, never on the answer.
    expect(rows[2].hot).toBe(true)
    expect(rows[0].hot).toBe(false)
  })

  it('drops unknown estimates and honours the limit', () => {
    const rows = buildClientActivity({
      events: [ev('a', 'gone', 's', 'view', ago(1000)), ev('b', 'e1', 's1', 'view', ago(2000)), ev('c', 'e1', 's2', 'view', ago(3000))],
      responses: [],
      estimates,
      limit: 1,
      now: NOW,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('ev:b')
  })
})

describe('relative time + i18n', () => {
  it('maps to translatable templates', () => {
    const now = NOW.getTime()
    expect(relativeTimeParts(ago(10_000), now).key).toBe('just now')
    expect(relativeTimeParts(ago(5 * 60_000), now)).toMatchObject({ key: '{n} min ago', n: 5 })
    expect(relativeTimeParts(ago(2 * H), now)).toMatchObject({ key: '{n}h ago', n: 2 })
    expect(relativeTimeParts(ago(3 * 24 * H), now)).toMatchObject({ key: '{n}d ago', n: 3 })
    expect(relativeTimeParts(ago(60 * 24 * H), now).key).toBeNull()
    expect(fillTemplate('{n}h ago', { n: 2 })).toBe('2h ago')
  })

  it('has pt and es for every key with the same placeholders', () => {
    const pt = clientActivityTranslations.pt
    const es = clientActivityTranslations.es
    expect(Object.keys(es).sort()).toEqual(Object.keys(pt).sort())
    for (const [k, v] of Object.entries(pt)) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()
      expect(ph(v)).toBe(ph(k))
      expect(ph(es[k])).toBe(ph(k))
    }
  })
})

describe('foldRepeatedOpens', () => {
  const row = (over: Partial<ClientActivityRow>): ClientActivityRow => ({
    id: Math.random().toString(36),
    kind: 'opened',
    at: '2026-11-20T15:00:00.000Z',
    estimateId: 'e1',
    projectId: 'p1',
    projectName: 'Kitchen',
    clientName: 'Ava',
    device: 'mobile',
    hot: false,
    count: 1,
    ...over,
  })

  it('folds back-to-back opens of one estimate on the same day', () => {
    const out = foldRepeatedOpens([
      row({ at: '2026-11-20T15:00:00.000Z' }),
      row({ at: '2026-11-20T14:00:00.000Z' }),
      row({ at: '2026-11-20T09:00:00.000Z' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].count).toBe(3)
    expect(out[0].at).toBe('2026-11-20T15:00:00.000Z')
  })

  it('keeps other days, other estimates and other kinds apart', () => {
    const out = foldRepeatedOpens([
      row({ at: '2026-11-20T15:00:00.000Z' }),
      row({ at: '2026-11-20T14:00:00.000Z', estimateId: 'e2' }),
      row({ at: '2026-11-20T13:00:00.000Z' }),
      row({ at: '2026-11-20T12:00:00.000Z', kind: 'accepted' }),
      row({ at: '2026-11-19T12:00:00.000Z' }),
    ])
    expect(out.map((r) => r.count)).toEqual([1, 1, 1, 1, 1])
  })
})
