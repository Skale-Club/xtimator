import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * HARD-04 — refine route error surface (Wave 0 RED scaffold, route-level).
 *
 * The refine POST handler must return a TYPED JSON envelope `{ error, code }` (via
 * asResponse) instead of the bespoke opaque 500 `{ error }` it returns today when an
 * inner step throws. Plan 99-02 wraps the handler in `catch -> asResponse(err)`.
 *
 * This drives the REAL route handler (not asResponse in isolation): auth + Supabase +
 * the AI provider are mocked so the handler reaches a thrown inner error
 * (`provider.refineEstimate` rejects), then we assert the response JSON carries a `code`.
 *
 * The request uses the route's JSON `{ instruction }` back-compat path on purpose:
 * `Request.formData()` multipart parsing hangs in the vitest (jsdom) environment, so the
 * multipart wiring is infeasible in unit scope. The JSON path still flows through the SAME
 * top-level handler + the SAME bespoke `catch` (route line ~285) that this phase replaces,
 * so the RED signal genuinely comes from the route handler — NOT from an asResponse-boundary
 * substitute (that path is already green and would be a false pass).
 *
 * RED today: the route's top-level catch returns `{ error }` with NO `code` field.
 */

const mockGetClaims = vi.fn()
const mockFrom = vi.fn()
const mockRefineEstimate = vi.fn()

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
  demoGuardResponse: vi.fn(async () => null),
}))
vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true })),
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
    currency_code: 'USD',
    sections: [],
  })),
}))
vi.mock('@/lib/queries/price-book', () => ({
  getPriceBookItems: vi.fn(async () => []),
}))
vi.mock('@/lib/ai', () => ({
  getAIProvider: vi.fn(async () => ({
    refineEstimate: mockRefineEstimate,
  })),
}))
vi.mock('@/lib/ai/openrouter-client', () => ({
  transcribeAudioOR: vi.fn(async () => ''),
  analyzePhotoOR: vi.fn(async () => ''),
}))
// Pre-launch audit fix (M-3): the route resolves the caller's company via
// getActiveCompanyId() instead of the old companies.user_id = claims.sub lookup.
const mockGetActiveCompanyId = vi.fn()
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: (...args: unknown[]) => mockGetActiveCompanyId(...args),
}))

import { POST } from '@/app/api/estimates/[id]/refine/route'

function makeJsonRequest(): Request {
  return new Request('http://localhost/api/estimates/est-1/refine', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ instruction: 'Add a section for cleanup labor.' }),
  })
}

describe('refine route error surface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    // Inner AI step throws — this is the failure we drive through the handler.
    mockRefineEstimate.mockRejectedValue(new Error('OpenRouter refine down'))
    mockGetActiveCompanyId.mockResolvedValue('company-1')
    // companies lookup returns the owning company.
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
      // estimate_activity insert (not reached on the error path, but safe).
      return { insert: async () => ({}) }
    })
  })

  it('refine returns typed JSON {error, code}, not opaque 500, on a thrown inner error', async () => {
    const res = await POST(makeJsonRequest(), {
      params: Promise.resolve({ id: 'est-1' }),
    })

    const body = await res.json()
    // RED today: the route's bespoke catch returns { error } with NO code field.
    expect(body.code).toBeDefined()
  })
})
