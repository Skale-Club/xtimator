import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * HARD-01 — refine route response-shape + status-code contract (Wave 0 RED scaffold).
 *
 * The refine POST handler is the editor's stable contract. After Phase 101 routes refine
 * through `buildRefineGraph` (inline), the route MUST still return EXACTLY:
 *   success → `{ success: true, refined: <EstimateOutput>, instruction: <string> }`, status 200
 *   failure → the typed `{ error, code }` envelope (via asResponse), NOT `{ success: true }`
 * and preserve the status codes: 400 (no input), 422 (no usable instruction), 429 (rate limit),
 * demo-guard.
 *
 * CRITICAL (vitest/jsdom): `Request.formData()` multipart parsing HANGS in this env
 * (see refine-error-surface.test.ts:16-21), so this test drives ONLY the JSON `{ instruction }`
 * back-compat path — the SAME top-level handler + the SAME outer catch the multipart path uses.
 * Multimodal (audio/photo) ingestion is validated at the ingestMultimodal unit level instead.
 *
 * RED today: the success path returns `{ success, refined, instruction }` (already), but the
 * 422 "no usable instruction" path is only reachable AFTER ingestion — once Wave 1/2 route the
 * assembled instruction through the shared ingestion/graph, the contract is owned end-to-end here.
 * The provider-failure case asserts `{ error, code }` (typed envelope) — RED until the graph's
 * onError → asResponse mapping lands. The shape/200 + 400 + 429 + demo-guard cases pin the
 * contract so Wave 1/2 cannot drift it.
 *
 * Wave-1/2 owner: 101-02 / 101-03 (thin route wrapper invoking buildRefineGraph).
 */

const mockGetClaims = vi.fn()
const mockFrom = vi.fn()
const mockRefineEstimate = vi.fn()
const mockRateLimit = vi.fn()
const mockDemoGuard = vi.fn()

// Phase 167-01 (BILL-01): the route now runs a credit gate on every request —
// stub it permissive (plain async fn, not vi.fn, so no global mock reset can
// ever strip it — same pattern as tests/unit/api/generate-estimate-quota.test.ts)
// so this file's status-code/shape contract stays focused on ITS OWN concern.
// The gate's own contract lives in tests/unit/api/refine-credit-gate.test.ts.
vi.mock('@/lib/billing/credit-ledger', () => ({
  checkCredits: async () => ({ allowed: true, balance: 1000, shortfall: 0 }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: mockGetClaims },
    from: mockFrom,
  })),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(() => ({})),
}))
vi.mock('@/lib/demo/guard', () => ({
  demoGuardResponse: (...args: unknown[]) => mockDemoGuard(...args),
}))
vi.mock('@/lib/ratelimit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}))
vi.mock('@/lib/storage', () => ({
  createStorage: vi.fn(() => ({
    upload: vi.fn(async () => ({})),
    download: vi.fn(async () => new Blob(['x'], { type: 'audio/webm' })),
    delete: vi.fn(async () => ({})),
  })),
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
// Both the legacy direct provider and the fallback-aware provider routed through the graph.
vi.mock('@/lib/ai', () => ({
  getAIProvider: vi.fn(async () => ({ refineEstimate: mockRefineEstimate })),
}))
vi.mock('@/lib/ai/provider-with-fallback', () => ({
  getAIProviderWithFallback: vi.fn(async () => ({ refineEstimate: mockRefineEstimate })),
}))
vi.mock('@/lib/ai/openrouter-client', () => ({
  // Phase 167 (BILL-05): transcribeAudioOR resolves { text, servedBy } — this
  // JSON-only test path never sends audio, so the mock is unreached, but kept
  // shape-correct for anyone extending this file to the multipart path.
  transcribeAudioOR: vi.fn(async () => ({ text: '', servedBy: 'primary' as const })),
  analyzePhotoOR: vi.fn(async () => ''),
}))
// Pre-launch audit fix (M-3): the route resolves the caller's company via
// getActiveCompanyId() instead of the old companies.user_id = claims.sub lookup.
const mockGetActiveCompanyId = vi.fn()
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

describe('HARD-01: refine route response-shape + status-code contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    mockDemoGuard.mockResolvedValue(null)
    mockRateLimit.mockResolvedValue({ allowed: true })
    mockRefineEstimate.mockResolvedValue(REFINED_OUTPUT)
    mockGetActiveCompanyId.mockResolvedValue('company-1')
    mockFrom.mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'company-1',
                  default_tax_rate: 0,
                  default_payment_terms: null,
                  default_warranty_terms: null,
                },
              }),
            }),
          }),
        }
      }
      // Phase 164 Plan 02 (TRUST-02): the route now also does a
      // signature-exists lookup (estimate_signatures) before the credit
      // gate — default to "no signature" so this file's own concern (the
      // response-shape/status-code contract) stays isolated. The lock
      // guard's own contract lives in tests/unit/api/refine-lock-guard.test.ts.
      return {
        insert: async () => ({}),
        select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }),
      }
    })
  })

  it('success → { success: true, refined, instruction } with status 200', async () => {
    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toEqual({
      success: true,
      refined: REFINED_OUTPUT,
      instruction: 'Add a cleanup section.',
    })
  })

  it('empty body / no instruction → status 400', async () => {
    const res = await POST(jsonRequest({}), PARAMS)
    expect(res.status).toBe(400)
  })

  it('no usable instruction (whitespace only) → status 422', async () => {
    // After trimming, the instruction is empty → the route must reject as 422
    // "no usable instruction" (a pre-graph input guard, distinct from the 400 no-input case).
    const res = await POST(jsonRequest({ instruction: '   ' }), PARAMS)
    expect(res.status).toBe(422)
  })

  it('rate-limit denied → status 429', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 })
    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)
    expect(res.status).toBe(429)
  })

  it('demo-guard active → the demo-guard response is returned', async () => {
    const demoResponse = new Response(JSON.stringify({ error: 'demo' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })
    mockDemoGuard.mockResolvedValue(demoResponse)
    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)
    expect(res).toBe(demoResponse)
  })

  it('provider failure → typed { error, code } envelope, NOT { success: true }', async () => {
    mockRefineEstimate.mockRejectedValue(new Error('OpenRouter refine down'))
    const res = await POST(jsonRequest({ instruction: 'Add a cleanup section.' }), PARAMS)

    const body = await res.json()
    expect(body.success).not.toBe(true)
    // RED until the graph onError → asResponse mapping lands: a typed code must be present.
    expect(body.code).toBeDefined()
  })
})
