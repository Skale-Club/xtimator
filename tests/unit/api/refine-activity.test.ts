import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const mockGetClaims = vi.fn()
const mockFrom = vi.fn()
const mockRefineEstimate = vi.fn()
const mockRecordCreditDebit = vi.fn()
const inserts: Array<{ table: string; row: Record<string, unknown> }> = []
let activityShouldThrow = false

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getClaims: mockGetClaims }, from: mockFrom })),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: null }), in: async () => ({ data: [] }) }),
      }),
    }),
  })),
}))
vi.mock('@/lib/demo/guard', () => ({ demoGuardResponse: async () => null }))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/billing/credit-ledger', () => ({
  checkCredits: async () => ({ allowed: true, balance: 1000, shortfall: 0 }),
  recordCreditDebit: (...a: unknown[]) => mockRecordCreditDebit(...a),
}))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: async () => 'company-1' }))
vi.mock('@/lib/queries/price-book', () => ({ getPriceBookItems: vi.fn(async () => []) }))
vi.mock('@/lib/ai/provider-with-fallback', () => ({
  getAIProviderWithFallback: vi.fn(async () => ({ refineEstimate: mockRefineEstimate })),
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
    language: 'pt',
    sections: [
      {
        title: 'Walls',
        items: [{ description: 'Paint', quantity: 1, unit: null, unit_price: 10, price_source: 'ai_estimate', confidence: 'high', basis: 'seen', optional: true }],
      },
    ],
  })),
}))

import { POST } from '@/app/api/estimates/[id]/refine/route'

const PARAMS = { params: Promise.resolve({ id: 'est-1' }) }
const req = (body: unknown) =>
  new Request('http://localhost/api/estimates/est-1/refine', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  inserts.length = 0
  activityShouldThrow = false
  mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
  mockRefineEstimate.mockResolvedValue({ suggested_project_name: 'R', suggested_client_name: null, summary: 'S', sections: [] })
  mockFrom.mockImplementation((table: string) => ({
    insert: async (row: Record<string, unknown>) => {
      if (activityShouldThrow) throw new Error('db down')
      inserts.push({ table, row })
      return {}
    },
    select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }),
  }))
})

describe('refine route: activity + metadata', () => {
  it('writes a refine_requested activity (instruction capped at 500, attempt_id) and no recordings row', async () => {
    const res = await POST(req({ instruction: 'x'.repeat(800) }), PARAMS)
    expect(res.status).toBe(200)
    const requested = inserts.find((i) => i.row.event_type === 'refine_requested')
    expect(requested?.table).toBe('estimate_activity')
    const meta = requested!.row.metadata as { instruction: string; attempt_id: string }
    expect(meta.instruction).toHaveLength(500)
    expect(typeof meta.attempt_id).toBe('string')
    expect(inserts.some((i) => i.table === 'recordings')).toBe(false)
    expect(mockFrom.mock.calls.some((c) => c[0] === 'recordings')).toBe(false)
  })

  it('an activity failure never fails the request', async () => {
    activityShouldThrow = true
    const res = await POST(req({ instruction: 'Add something' }), PARAMS)
    expect(res.status).toBe(200)
  })

  it('feeds per-line metadata and the estimate language into the refine call', async () => {
    await POST(req({ instruction: 'Add something' }), PARAMS)
    const arg = mockRefineEstimate.mock.calls[0][0]
    expect(arg.language).toBe('pt')
    expect(arg.existingEstimate.sections[0].items[0]).toMatchObject({ confidence: 'high', basis: 'seen', optional: true, price_source: 'ai_estimate' })
  })
})
