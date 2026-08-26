import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Phase 193-01 — public engagement-tracking beacon collector contract.
 *
 * Covers app/api/track/estimate/route.ts:
 *   - parseTrackBody: batch cap (truncate, not reject), numeric clamping,
 *     unlock_ok/unlock_fail rejection (server-emitted-only event types).
 *   - POST handler: rate-limit-first ordering (mirrors sign-route-contract's
 *     "denies before ever calling requireServiceClient" test), unknown/
 *     expired token → 204 no-op (no oracle), demo-tenant → 204 no-op,
 *     happy path inserts rows + increments view_count, and the endpoint
 *     NEVER returns anything but 204 — even on a thrown error.
 *
 * Mirrors the mocking style of tests/unit/api/sign-route-contract.test.ts.
 */

const mockRateLimit = vi.fn()
const mockAssertCompanyWritable = vi.fn()
const mockRequireServiceClient = vi.fn()
const mockHeaders = vi.fn()

vi.mock('next/headers', () => ({ headers: () => mockHeaders() }))
vi.mock('@/lib/ratelimit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}))
vi.mock('@/lib/demo/guard', () => ({
  assertCompanyWritable: (...args: unknown[]) => mockAssertCompanyWritable(...args),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => mockRequireServiceClient(),
}))

import { POST, parseTrackBody } from '@/app/api/track/estimate/route'

function jsonRequest(body: unknown, headersInit?: HeadersInit): Request {
  return new Request('http://localhost/api/track/estimate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(headersInit as Record<string, string>) },
    body: JSON.stringify(body),
  })
}

function buildSupabase({
  estimateByShareToken = null,
  estimateByPublicToken = null,
  currentViewCount = 0,
}: {
  estimateByShareToken?: Record<string, unknown> | null
  estimateByPublicToken?: Record<string, unknown> | null
  currentViewCount?: number
} = {}) {
  const insertMock = vi.fn().mockResolvedValue({ data: null, error: null })
  // Counter increments go through the bump_estimate_view_count RPC, never a
  // direct .update() — see the view-counter tests below for why.
  const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null })
  const updateEqMock = vi.fn().mockResolvedValue({ data: null, error: null })
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock })

  const estimatesChain = {
    select: vi.fn((cols: string) => {
      if (cols === 'view_count') {
        return {
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { view_count: currentViewCount }, error: null }),
          }),
        }
      }
      return {
        eq: vi.fn((col: string) => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: col === 'share_token' ? estimateByShareToken : estimateByPublicToken,
            error: null,
          }),
        })),
      }
    }),
    update: updateMock,
  }

  const engagementEventsChain = { insert: insertMock }

  const fromMock = vi.fn((table: string) => {
    if (table === 'estimates') return estimatesChain
    if (table === 'estimate_engagement_events') return engagementEventsChain
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    from: fromMock,
    rpc: rpcMock,
    __insertMock: insertMock,
    __updateMock: updateMock,
    __updateEqMock: updateEqMock,
    __rpcMock: rpcMock,
  }
}

function estimateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'est-1',
    company_id: 'company-1',
    share_expires_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRateLimit.mockResolvedValue({ allowed: true, count: 1, max: 60 })
  mockAssertCompanyWritable.mockResolvedValue(null)
  mockHeaders.mockReturnValue(new Headers({ 'x-forwarded-for': '198.51.100.1' }))
})

describe('parseTrackBody', () => {
  it('rejects unlock_ok and unlock_fail — server-emitted-only event types', () => {
    expect(
      parseTrackBody({
        token: 't1',
        visitor_id: 'v1',
        session_id: 's1',
        events: [{ event_type: 'unlock_ok' }],
      })
    ).toBeNull()
    expect(
      parseTrackBody({
        token: 't1',
        visitor_id: 'v1',
        session_id: 's1',
        events: [{ event_type: 'unlock_fail' }],
      })
    ).toBeNull()
  })

  it('rejects any unrecognized event_type', () => {
    expect(
      parseTrackBody({
        token: 't1',
        visitor_id: 'v1',
        session_id: 's1',
        events: [{ event_type: 'made_up_event' }],
      })
    ).toBeNull()
  })

  it('truncates an oversized batch to 25 events rather than rejecting it outright', () => {
    const events = Array.from({ length: 40 }, () => ({ event_type: 'heartbeat' as const }))
    const parsed = parseTrackBody({ token: 't1', visitor_id: 'v1', session_id: 's1', events })
    expect(parsed).not.toBeNull()
    expect(parsed!.events).toHaveLength(25)
  })

  it('clamps out-of-range numeric fields instead of rejecting the event', () => {
    const parsed = parseTrackBody({
      token: 't1',
      visitor_id: 'v1',
      session_id: 's1',
      events: [{ event_type: 'click', x_pct: 150, y_px: -10 }],
    })
    expect(parsed).not.toBeNull()
    expect(parsed!.events[0].x_pct).toBe(100)
    expect(parsed!.events[0].y_px).toBe(0)
  })

  it('rejects a body missing required fields (no token)', () => {
    expect(
      parseTrackBody({ visitor_id: 'v1', session_id: 's1', events: [{ event_type: 'view' }] })
    ).toBeNull()
  })

  it('rejects an empty events array', () => {
    expect(parseTrackBody({ token: 't1', visitor_id: 'v1', session_id: 's1', events: [] })).toBeNull()
  })

  it('rejects a malformed device value', () => {
    expect(
      parseTrackBody({
        token: 't1',
        visitor_id: 'v1',
        session_id: 's1',
        events: [{ event_type: 'view', device: 'tablet' }],
      })
    ).toBeNull()
  })
})

describe('POST /api/track/estimate — rate limiting runs first', () => {
  it('drops (204) without ever calling requireServiceClient when the limiter blocks', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, count: 61, max: 60, retryAfter: 5 })

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', visitor_id: 'v1', session_id: 's1', events: [{ event_type: 'view' }] })
    )

    expect(res.status).toBe(204)
    expect(mockRequireServiceClient).not.toHaveBeenCalled()
  })

  it('keys the limiter on the resolved IP', async () => {
    const supabase = buildSupabase({ estimateByShareToken: estimateRow() })
    mockRequireServiceClient.mockReturnValue(supabase)

    await POST(
      jsonRequest({ token: 'share-token-abc', visitor_id: 'v1', session_id: 's1', events: [{ event_type: 'view' }] })
    )

    expect(mockRateLimit).toHaveBeenCalledWith('trackEstimatePerMinute', '198.51.100.1')
  })
})

describe('POST /api/track/estimate — always 204, never an oracle', () => {
  it('unknown token → 204, no insert', async () => {
    const supabase = buildSupabase({ estimateByShareToken: null, estimateByPublicToken: null })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(
      jsonRequest({ token: 'nope', visitor_id: 'v1', session_id: 's1', events: [{ event_type: 'view' }] })
    )

    expect(res.status).toBe(204)
    expect(supabase.__insertMock).not.toHaveBeenCalled()
  })

  it('expired share link → 204, no insert', async () => {
    const supabase = buildSupabase({
      estimateByShareToken: estimateRow({ share_expires_at: '2000-01-01T00:00:00.000Z' }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', visitor_id: 'v1', session_id: 's1', events: [{ event_type: 'view' }] })
    )

    expect(res.status).toBe(204)
    expect(supabase.__insertMock).not.toHaveBeenCalled()
  })

  it('resolves via public_slug_token when share_token misses', async () => {
    const supabase = buildSupabase({
      estimateByShareToken: null,
      estimateByPublicToken: estimateRow({ id: 'est-2', company_id: 'company-2' }),
    })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(
      jsonRequest({ token: 'short-tok', visitor_id: 'v1', session_id: 's1', events: [{ event_type: 'section_view', target: 'header' }] })
    )

    expect(res.status).toBe(204)
    expect(supabase.__insertMock).toHaveBeenCalledWith([
      expect.objectContaining({ estimate_id: 'est-2', company_id: 'company-2', event_type: 'section_view', target: 'header' }),
    ])
  })

  it('demo tenant → 204, no insert (assertCompanyWritable denies)', async () => {
    mockAssertCompanyWritable.mockResolvedValue({ error: 'demo readonly' })
    const supabase = buildSupabase({ estimateByShareToken: estimateRow() })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(
      jsonRequest({ token: 'share-token-abc', visitor_id: 'v1', session_id: 's1', events: [{ event_type: 'view' }] })
    )

    expect(res.status).toBe(204)
    expect(supabase.__insertMock).not.toHaveBeenCalled()
  })

  it('an oversized body (> 32KB) → 204, no DB call at all', async () => {
    const supabase = buildSupabase({ estimateByShareToken: estimateRow() })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(
      jsonRequest({
        token: 'share-token-abc',
        visitor_id: 'v1',
        session_id: 's1',
        events: [{ event_type: 'view', metadata: { pad: 'x'.repeat(40 * 1024) } }],
      })
    )

    expect(res.status).toBe(204)
    expect(mockRequireServiceClient).not.toHaveBeenCalled()
  })

  it('a malformed JSON body → 204, never throws', async () => {
    const req = new Request('http://localhost/api/track/estimate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not valid json',
    })
    const res = await POST(req)
    expect(res.status).toBe(204)
  })
})

describe('POST /api/track/estimate — happy path', () => {
  it('inserts every event row scoped to the resolved estimate/company', async () => {
    const supabase = buildSupabase({ estimateByShareToken: estimateRow() })
    mockRequireServiceClient.mockReturnValue(supabase)

    const res = await POST(
      jsonRequest({
        token: 'share-token-abc',
        visitor_id: 'visitor-1',
        session_id: 'session-1',
        events: [
          { event_type: 'view', device: 'desktop', viewport_w: 1280 },
          { event_type: 'click', target: 'totals', x_pct: 12.5, y_px: 300, doc_h: 4000 },
        ],
      })
    )

    expect(res.status).toBe(204)
    expect(supabase.__insertMock).toHaveBeenCalledWith([
      expect.objectContaining({
        estimate_id: 'est-1',
        company_id: 'company-1',
        visitor_id: 'visitor-1',
        session_id: 'session-1',
        event_type: 'view',
        device: 'desktop',
        viewport_w: 1280,
      }),
      expect.objectContaining({
        estimate_id: 'est-1',
        company_id: 'company-1',
        event_type: 'click',
        target: 'totals',
        x_pct: 12.5,
        y_px: 300,
        doc_h: 4000,
      }),
    ])
  })

  it('increments view_count through the atomic RPC, by the number of view events', async () => {
    const supabase = buildSupabase({ estimateByShareToken: estimateRow(), currentViewCount: 7 })
    mockRequireServiceClient.mockReturnValue(supabase)

    await POST(
      jsonRequest({
        token: 'share-token-abc',
        visitor_id: 'v1',
        session_id: 's1',
        events: [{ event_type: 'view' }, { event_type: 'view' }, { event_type: 'click' }],
      })
    )

    expect(supabase.__rpcMock).toHaveBeenCalledWith('bump_estimate_view_count', {
      p_estimate_id: 'est-1',
      p_delta: 2,
    })
  })

  it('never writes estimates via .update() — the counter must not restamp updated_at', async () => {
    // estimates.updated_at is an optimistic-concurrency token
    // (p_expected_updated_at in lib/actions/estimate.ts and sign_estimate_atomic)
    // and a PDF cache key. A plain .update() here would fire
    // trg_estimates_set_updated_at on every anonymous page view, spuriously
    // failing the owner's in-flight save and the client's own signature attempt.
    // Migration 20260825000002 keeps the RPC out of that path; this test keeps
    // the route from regressing back to a direct update.
    const supabase = buildSupabase({ estimateByShareToken: estimateRow(), currentViewCount: 7 })
    mockRequireServiceClient.mockReturnValue(supabase)

    await POST(
      jsonRequest({
        token: 'share-token-abc',
        visitor_id: 'v1',
        session_id: 's1',
        events: [{ event_type: 'view' }],
      })
    )

    expect(supabase.__updateMock).not.toHaveBeenCalled()
  })

  it('does not touch view_count when the batch has no view events', async () => {
    const supabase = buildSupabase({ estimateByShareToken: estimateRow() })
    mockRequireServiceClient.mockReturnValue(supabase)

    await POST(
      jsonRequest({
        token: 'share-token-abc',
        visitor_id: 'v1',
        session_id: 's1',
        events: [{ event_type: 'click' }],
      })
    )

    expect(supabase.__rpcMock).not.toHaveBeenCalled()
    expect(supabase.__updateMock).not.toHaveBeenCalled()
  })
})
