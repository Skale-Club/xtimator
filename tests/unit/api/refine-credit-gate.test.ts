import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Phase 167-01 (BILL-01) — refine route credit gate.
 *
 * v4.19 audit D1: refine runs Whisper + Vision + Claude behind ONLY a
 * per-minute rate limit (`refinePerMinute`) — grep `checkCredits` in
 * `app/api/estimates/**` returned ZERO matches. A zero-balance company could
 * refine indefinitely at platform cost while generate correctly blocked with
 * a 402. This test locks the gate's contract: it mirrors
 * app/api/generate-estimate/route.ts:110-129 byte-for-byte (same JSON keys,
 * same status), sits AFTER auth/ownership, and BEFORE any paid call
 * (ingestMultimodal is the first one) — a blocked company must never reach
 * Whisper/Vision/Claude.
 */

const mockGetClaims = vi.fn()
const mockFrom = vi.fn()
const mockRateLimit = vi.fn()
const mockDemoGuard = vi.fn()
const mockCheckCredits = vi.fn()
const mockIngestMultimodal = vi.fn()
const mockGraphInvoke = vi.fn()
const mockGetActiveCompanyId = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: mockGetClaims },
    from: mockFrom,
  })),
}))
vi.mock('@/lib/demo/guard', () => ({
  demoGuardResponse: (...args: unknown[]) => mockDemoGuard(...args),
}))
vi.mock('@/lib/ratelimit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}))
// The gate under test — mocked so both outcomes (allowed/not-allowed) are
// directly controllable per test.
vi.mock('@/lib/billing/credit-ledger', () => ({
  checkCredits: (...args: unknown[]) => mockCheckCredits(...args),
}))
vi.mock('@/lib/queries/estimate', () => ({
  getEstimateById: vi.fn(async () => ({
    id: 'est-1',
    project_id: 'proj-1',
    company_id: 'company-1',
    is_current: true,
    workflow_status: 'draft',
    summary: 'Estimate',
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    currency_code: 'USD',
    sections: [],
  })),
}))
// The first paid call the gate must precede — mocked so we can assert it was
// NEVER invoked when the gate blocks.
vi.mock('@/lib/estimate/ingest/multimodal', () => ({
  ingestMultimodal: (...args: unknown[]) => mockIngestMultimodal(...args),
}))
vi.mock('@/lib/estimate/graph/refine-graph', () => ({
  buildRefineGraph: vi.fn(() => ({ invoke: mockGraphInvoke })),
}))
vi.mock('@/lib/estimate/adapters/refine', () => ({
  makeRefineAdapter: vi.fn(() => ({})),
}))
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: (...args: unknown[]) => mockGetActiveCompanyId(...args),
}))

import { POST } from '@/app/api/estimates/[id]/refine/route'

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/estimates/est-1/refine', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const PARAMS = { params: Promise.resolve({ id: 'est-1' }) }

describe('BILL-01: refine route credit gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    mockDemoGuard.mockResolvedValue(null)
    mockRateLimit.mockResolvedValue({ allowed: true })
    mockGetActiveCompanyId.mockResolvedValue('company-1')
    // Phase 164 Plan 02 (TRUST-02): the route now also does a signature-exists
    // lookup (estimate_signatures) before the credit gate — default to "no
    // signature" so this file's own concern (the credit gate) stays isolated.
    // The lock guard's own contract lives in tests/unit/api/refine-lock-guard.test.ts.
    mockFrom.mockImplementation(() => ({
      insert: async () => ({}),
      select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }),
    }))
    mockIngestMultimodal.mockResolvedValue({
      transcripts: [],
      photoDescriptions: [],
      texts: ['Add a cleanup section.'],
    })
    mockGraphInvoke.mockResolvedValue({
      refined: {
        suggested_project_name: 'Refined',
        suggested_client_name: null,
        summary: 'Refined summary',
        sections: [],
      },
    })
  })

  it('not-allowed → 402 { error: plan_limit_reached, reason: credits, upgradeUrl, topUpUrl } byte-compatible with generate', async () => {
    mockCheckCredits.mockResolvedValue({ allowed: false, balance: 0, shortfall: 1 })

    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)

    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body).toEqual({
      error: 'plan_limit_reached',
      reason: 'credits',
      upgradeUrl: '/settings/billing',
      topUpUrl: '/settings/billing?topup=1',
    })
  })

  it('not-allowed → NO AI call performed (ingestMultimodal and the refine graph are never invoked)', async () => {
    mockCheckCredits.mockResolvedValue({ allowed: false, balance: 0, shortfall: 1 })

    await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)

    expect(mockIngestMultimodal).not.toHaveBeenCalled()
    expect(mockGraphInvoke).not.toHaveBeenCalled()
  })

  it('not-allowed with shortfall: 0 (record-only / enforcement off) → no affordance key, still 402', async () => {
    // checkCredits' own record-only posture (enforcementEnabled=false) always
    // returns allowed:true, so this path only matters if a caller reaches
    // 'allowed: false' with shortfall 0 (defensive — buildOverageAffordance
    // returns null and the topUpUrl key must be omitted, not undefined).
    mockCheckCredits.mockResolvedValue({ allowed: false, balance: 5, shortfall: 0 })

    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)

    const body = await res.json()
    expect(body).toEqual({
      error: 'plan_limit_reached',
      reason: 'credits',
      upgradeUrl: '/settings/billing',
    })
    expect(body.topUpUrl).toBeUndefined()
  })

  it('allowed → route proceeds through ingestion + the refine graph exactly as before (200)', async () => {
    mockCheckCredits.mockResolvedValue({ allowed: true, balance: 100, shortfall: 0 })

    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)

    expect(res.status).toBe(200)
    expect(mockIngestMultimodal).toHaveBeenCalledOnce()
    expect(mockGraphInvoke).toHaveBeenCalledOnce()
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('gate is called with the resolved companyId and an estimatedCredits of 1 (mirrors generate)', async () => {
    mockCheckCredits.mockResolvedValue({ allowed: true, balance: 100, shortfall: 0 })

    await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)

    expect(mockCheckCredits).toHaveBeenCalledWith(expect.anything(), 'company-1', 1)
  })
})
