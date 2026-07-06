import { describe, it, expect, vi, beforeEach } from 'vitest'

// Billing v2: the credit gate now runs on every request — stub it permissive so
// these tests stay focused on their own contract (the gate has its own tests).
vi.mock('@/lib/billing/credit-ledger', () => ({
  // plain async fn (not vi.fn) so global mock resets can never strip the value
  checkCredits: async () => ({ allowed: true, balance: 1000, shortfall: 0 }),
}))

/**
 * INNGEST-02: POST /api/generate-estimate dispatches via Inngest (Wave 1 GREEN).
 *
 * Plan 67-03 refactored app/api/generate-estimate/route.ts. Contract:
 *   - returns { jobId } shape (HTTP 202 Accepted) in <1s
 *   - does NOT call generateEstimateForProject directly (work in Inngest function)
 *   - does NOT call recordUsage directly (work in Inngest function final step)
 *   - calls inngest.send() with name 'estimate/generate.requested'
 *     and event id starting with 'estimate-' for event-level idempotency
 */

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: vi.fn(),
  },
}))

vi.mock('@/lib/services/generate-estimate', () => ({
  generateEstimateForProject: vi.fn(),
}))

vi.mock('@/lib/quota', () => ({
  checkQuota: vi.fn(),
  recordUsage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, count: 0, max: 100 }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// The route now resolves the company via getActiveCompanyId() (cookie-based,
// calls cookies()); mock it so the route doesn't call cookies() outside a
// request scope (otherwise it throws → 500 instead of the expected status).
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(),
}))

// The route calls requireServiceClient() for the GUARD-DEMO quota check.
// Without this mock, the real function throws on CI (no Supabase env vars)
// and the route returns 500 instead of the expected status.
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  // createServiceClient returns null so getBillingConfig() uses DEFAULT_BILLING_CONFIG
  // (enforcementEnabled: false) instead of making a real Supabase network call.
  createServiceClient: vi.fn().mockReturnValue(null),
}))

import { POST } from '@/app/api/generate-estimate/route'
import { createClient } from '@/lib/supabase/server'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { checkQuota, recordUsage } from '@/lib/quota'
import { inngest } from '@/lib/inngest/client'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireServiceClient } from '@/lib/supabase/service'

const mockSend = vi.mocked(inngest.send)
const mockGenerate = vi.mocked(generateEstimateForProject)
const mockRecord = vi.mocked(recordUsage)
const mockCheckQuota = vi.mocked(checkQuota)

function makeRequest(projectId?: string) {
  return new Request('http://localhost/api/generate-estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectId ? { projectId } : {}),
  })
}

function makeSupabaseMock(companyId = 'company-1') {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: 'user-1' } },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi
            .fn()
            .mockResolvedValue({ data: { id: companyId }, error: null }),
        }),
      }),
    }),
  }
}

describe('INNGEST-02: POST /api/generate-estimate dispatch', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { rateLimit } = await import('@/lib/ratelimit')
    vi.mocked(rateLimit).mockResolvedValue({
      allowed: true,
      count: 0,
      max: 100,
    })
    mockSend.mockResolvedValue({ ids: ['evt_abc123'] } as never)
    mockCheckQuota.mockResolvedValue({ allowed: true, remaining: 5 })
    vi.mocked(getActiveCompanyId).mockResolvedValue('company-1')
    // Return null company row so the GUARD-DEMO quota check is a no-op.
    vi.mocked(requireServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as never)
  })

  it('returns { jobId } HTTP 202 in <1s', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    const start = Date.now()
    const res = await POST(makeRequest('proj-1'))
    const elapsed = Date.now() - start

    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body).toEqual({ jobId: 'evt_abc123' })
    expect(elapsed).toBeLessThan(1000)
  })

  it('does NOT call generateEstimateForProject directly (work moved into Inngest function)', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    await POST(makeRequest('proj-1'))

    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('does NOT call recordUsage directly (work moved into Inngest function final step)', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    await POST(makeRequest('proj-1'))

    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('calls inngest.send() with name "estimate/generate.requested" and event id starting with "estimate-"', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    await POST(makeRequest('proj-1'))

    expect(mockSend).toHaveBeenCalledOnce()
    const payload = mockSend.mock.calls[0][0] as {
      name: string
      id: string
      data: { companyId: string; projectId: string; requestId: string }
    }
    expect(payload.name).toBe('estimate/generate.requested')
    expect(payload.id).toMatch(/^estimate-/)
    expect(payload.data.companyId).toBe('company-1')
    expect(payload.data.projectId).toBe('proj-1')
    expect(payload.data.requestId).toEqual(expect.any(String))
  })

  it('returns 402 when checkQuota returns { allowed: false } (quota check before dispatch)', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    mockCheckQuota.mockResolvedValue({ allowed: false, remaining: 0 })

    const res = await POST(makeRequest('proj-1'))

    expect(res.status).toBe(402)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({ data: { claims: null } }),
      },
    } as never)

    const res = await POST(makeRequest('proj-1'))

    expect(res.status).toBe(401)
    expect(mockSend).not.toHaveBeenCalled()
  })
})
