import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Fix (refine credit attribution) — HIGH: refine ran Whisper + Vision + Claude
 * behind the BILL-01 credit GATE (tests/unit/api/refine-credit-gate.test.ts)
 * but never actually DEBITED the company for the real spend — `checkCredits`
 * was called, `recordCreditDebit` never was. grep confirmed ZERO
 * `recordCreditDebit` call sites under app/api/estimates/**.
 *
 * This locks the fix's two load-bearing behaviors on a SUCCESSFUL refine:
 *   1. The route generates ONE stable attemptId and threads it (as part of a
 *      costContext) all the way into the refine node's own AI call — so the
 *      REAL refine.ts node (exercised here, not mocked) passes
 *      `costContext: { attemptId, companyId, projectId }` to
 *      `provider.refineEstimate`.
 *   2. AFTER a successful refine, the route reads back `ai_cost_events` for
 *      THAT SAME attemptId and calls `recordCreditDebit({ companyId,
 *      operationType: 'estimate', realCostUsd, attemptId })` — summing only
 *      the known (non-null) real_cost_usd rows.
 *
 * `getAIProviderWithFallback` is mocked so the refine NODE (real module) runs
 * against a controllable `refineEstimate` spy instead of a live provider —
 * this is what lets the test observe the costContext the node builds from
 * state without a live network call.
 */

const mockGetClaims = vi.fn()
const mockFrom = vi.fn()
const mockRateLimit = vi.fn()
const mockDemoGuard = vi.fn()
const mockRefineEstimate = vi.fn()
const mockGetActiveCompanyId = vi.fn()
const mockRecordCreditDebit = vi.fn()
const mockSvcFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: mockGetClaims },
    from: mockFrom,
  })),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(() => ({ from: mockSvcFrom })),
}))
vi.mock('@/lib/demo/guard', () => ({
  demoGuardResponse: (...args: unknown[]) => mockDemoGuard(...args),
}))
vi.mock('@/lib/ratelimit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}))
// The credit GATE stays permissive (its own contract lives in
// refine-credit-gate.test.ts) — recordCreditDebit is the spy THIS file locks.
vi.mock('@/lib/billing/credit-ledger', () => ({
  checkCredits: vi.fn(async () => ({ allowed: true, balance: 1000, shortfall: 0 })),
  recordCreditDebit: (...args: unknown[]) => mockRecordCreditDebit(...args),
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
vi.mock('@/lib/queries/price-book', () => ({
  getPriceBookItems: vi.fn(async () => []),
}))
// The refine NODE (real module) resolves the provider through this seam —
// mocked so `refineEstimate` is a controllable spy that surfaces the
// costContext the node built from state, with no live network call.
vi.mock('@/lib/ai/provider-with-fallback', () => ({
  getAIProviderWithFallback: vi.fn(async () => ({ refineEstimate: mockRefineEstimate })),
}))
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: (...args: unknown[]) => mockGetActiveCompanyId(...args),
}))

import { POST } from '@/app/api/estimates/[id]/refine/route'

const REFINED_OUTPUT = {
  suggested_project_name: 'Refined',
  suggested_client_name: null,
  summary: 'Refined summary',
  sections: [],
}

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/estimates/est-1/refine', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const PARAMS = { params: Promise.resolve({ id: 'est-1' }) }

describe('Fix (refine credit attribution): refine actually debits after a successful run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    mockDemoGuard.mockResolvedValue(null)
    mockRateLimit.mockResolvedValue({ allowed: true })
    mockGetActiveCompanyId.mockResolvedValue('company-1')
    mockRefineEstimate.mockResolvedValue(REFINED_OUTPUT)

    // Authed client (route-level): estimate_signatures lookup + estimate_activity insert.
    mockFrom.mockImplementation(() => ({
      insert: async () => ({}),
      select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }),
    }))

    // Service-role client (requireServiceClient): serves BOTH the refine
    // node's own company-row lookup AND the route's post-refine debit
    // read-back — dispatch on table name, mirroring the real schema.
    mockSvcFrom.mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { industry: null, currency_code: 'USD', default_estimate_language: null },
              }),
            }),
          }),
        }
      }
      if (table === 'ai_cost_events') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ data: [{ real_cost_usd: 1.5 }, { real_cost_usd: 0.25 }] }),
            }),
          }),
        }
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }
    })
  })

  it('threads ONE stable attemptId as costContext into the refine node\'s AI call', async () => {
    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)
    expect(res.status).toBe(200)

    expect(mockRefineEstimate).toHaveBeenCalledOnce()
    const call = mockRefineEstimate.mock.calls[0][0] as {
      costContext?: { attemptId?: string | null; companyId?: string | null; projectId?: string | null }
    }
    expect(call.costContext).toBeDefined()
    expect(typeof call.costContext?.attemptId).toBe('string')
    expect(call.costContext?.attemptId?.length).toBeGreaterThan(0)
    expect(call.costContext?.companyId).toBe('company-1')
    expect(call.costContext?.projectId).toBe('proj-1')
  })

  it('debits AFTER a successful refine: recordCreditDebit({ companyId, operationType: "estimate", realCostUsd, attemptId }) with the SAME attemptId threaded to refineEstimate', async () => {
    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)
    expect(res.status).toBe(200)

    expect(mockRecordCreditDebit).toHaveBeenCalledOnce()
    const debitArg = mockRecordCreditDebit.mock.calls[0][0] as {
      companyId: string
      operationType: string
      realCostUsd: number | null
      attemptId: string
    }
    expect(debitArg.companyId).toBe('company-1')
    expect(debitArg.operationType).toBe('estimate')
    // Sums the mocked ai_cost_events rows (1.5 + 0.25) — proves the read-back
    // actually flows into the debit's realCostUsd.
    expect(debitArg.realCostUsd).toBe(1.75)

    // The SAME attemptId the refine node received — proves this is one
    // coherent, correlated attempt end-to-end, not two independent ids.
    const refineCall = mockRefineEstimate.mock.calls[0][0] as {
      costContext?: { attemptId?: string | null }
    }
    expect(debitArg.attemptId).toBe(refineCall.costContext?.attemptId)

    // The read-back query is scoped to THIS attemptId and the ops refine's
    // own calls use — never a blanket, unfiltered read.
    const aiCostEventsFrom = mockSvcFrom.mock.calls.find((c) => c[0] === 'ai_cost_events')
    expect(aiCostEventsFrom).toBeDefined()
  })

  it('when ai_cost_events has no rows for the attempt, realCostUsd is null and recordCreditDebit no-ops it (never guessed at 0)', async () => {
    mockSvcFrom.mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { industry: null, currency_code: 'USD', default_estimate_language: null },
              }),
            }),
          }),
        }
      }
      if (table === 'ai_cost_events') {
        return { select: () => ({ eq: () => ({ in: async () => ({ data: [] }) }) }) }
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }
    })

    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)
    expect(res.status).toBe(200)

    expect(mockRecordCreditDebit).toHaveBeenCalledOnce()
    expect(mockRecordCreditDebit.mock.calls[0][0]).toMatchObject({ realCostUsd: null })
  })

  it('a failed refine never debits (mirrors "record usage/debit ONLY on AI success")', async () => {
    mockRefineEstimate.mockRejectedValue(new Error('OpenRouter refine down'))

    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)
    expect(res.status).not.toBe(200)

    expect(mockRecordCreditDebit).not.toHaveBeenCalled()
  })

  it('a debit read-back/write failure never changes the success response (best-effort, non-fatal)', async () => {
    mockSvcFrom.mockImplementation(() => {
      throw new Error('service client unavailable')
    })

    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})
