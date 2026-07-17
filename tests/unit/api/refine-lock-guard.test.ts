import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * TRUST-02 (Phase 164 Plan 02) — refine route freeze-on-send/sign guard.
 *
 * Lock coverage mirrors saveEstimate's guard exactly (lib/actions/estimate.ts):
 * a locked estimate is rejected when EITHER isEstimateLocked({sent_at,
 * client_response}) is true OR an estimate_signatures row exists (Opus
 * blocker #1 — sign/route.ts inserts the signature BEFORE respondToEstimate
 * and SWALLOWS a respond failure, so a signed estimate can still have
 * client_response === null — the signed-but-unresponded window). Placed
 * BEFORE the credit gate (167-01) and BEFORE ingestMultimodal — a locked
 * estimate must never reach a paid call.
 */

const mockGetClaims = vi.fn()
const mockFrom = vi.fn()
const mockRateLimit = vi.fn()
const mockDemoGuard = vi.fn()
const mockCheckCredits = vi.fn()
const mockIngestMultimodal = vi.fn()
const mockGraphInvoke = vi.fn()
const mockGetActiveCompanyId = vi.fn()
const mockGetEstimateById = vi.fn()

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
vi.mock('@/lib/billing/credit-ledger', () => ({
  checkCredits: (...args: unknown[]) => mockCheckCredits(...args),
}))
vi.mock('@/lib/queries/estimate', () => ({
  getEstimateById: (...args: unknown[]) => mockGetEstimateById(...args),
}))
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

const BASE_ESTIMATE = {
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
  sent_at: null as string | null,
  client_response: null as string | null,
}

let signatureRows: Array<{ id: string }> = []

describe('TRUST-02: refine route freeze-on-send/sign guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signatureRows = []
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    mockDemoGuard.mockResolvedValue(null)
    mockRateLimit.mockResolvedValue({ allowed: true })
    mockGetActiveCompanyId.mockResolvedValue('company-1')
    mockCheckCredits.mockResolvedValue({ allowed: true, balance: 100, shortfall: 0 })
    mockGetEstimateById.mockResolvedValue({ ...BASE_ESTIMATE })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'estimate_signatures') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({ data: signatureRows, error: null }),
            }),
          }),
        }
      }
      return { insert: async () => ({}) }
    })
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

  it('rejects a refine when sent_at is set (4xx, code carries estimate_locked, no paid call)', async () => {
    mockGetEstimateById.mockResolvedValue({ ...BASE_ESTIMATE, sent_at: '2026-07-17T00:00:00.000Z' })

    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    const body = await res.json()
    expect(body.code).toContain('estimate_locked')
    expect(mockIngestMultimodal).not.toHaveBeenCalled()
    expect(mockGraphInvoke).not.toHaveBeenCalled()
    expect(mockCheckCredits).not.toHaveBeenCalled()
  })

  it('rejects a refine when client_response is set (no paid call)', async () => {
    mockGetEstimateById.mockResolvedValue({ ...BASE_ESTIMATE, client_response: 'accepted' })

    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)

    const body = await res.json()
    expect(body.code).toContain('estimate_locked')
    expect(mockIngestMultimodal).not.toHaveBeenCalled()
    expect(mockCheckCredits).not.toHaveBeenCalled()
  })

  it('rejects a refine when a signature row exists even with sent_at AND client_response both null (signed-but-unresponded window)', async () => {
    signatureRows = [{ id: 'sig-1' }]

    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)

    const body = await res.json()
    expect(body.code).toContain('estimate_locked')
    expect(mockIngestMultimodal).not.toHaveBeenCalled()
    expect(mockCheckCredits).not.toHaveBeenCalled()
  })

  it('an unlocked (draft) estimate proceeds through the credit gate + ingestion as before', async () => {
    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)

    expect(res.status).toBe(200)
    expect(mockCheckCredits).toHaveBeenCalledOnce()
    expect(mockIngestMultimodal).toHaveBeenCalledOnce()
  })
})
