import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 67: After Inngest refactor, the route is a dispatcher. Tests here cover
 * the HTTP layer contract (auth, 401, 400, dispatch shape). The estimate
 * generation behavior itself is covered by tests/unit/inngest/generate-estimate-job.test.ts.
 */

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn() },
}))

vi.mock('@/lib/services/generate-estimate', () => ({
  generateEstimateForProject: vi.fn(),
}))

vi.mock('@/lib/quota', () => ({
  checkQuota: vi.fn().mockResolvedValue({ allowed: true, remaining: 5 }),
  recordUsage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, count: 0, max: 100 }),
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
import { inngest } from '@/lib/inngest/client'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireServiceClient } from '@/lib/supabase/service'

const mockSend = vi.mocked(inngest.send)

function makeRequest(projectId?: string) {
  return new Request('http://localhost/api/generate-estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectId ? { projectId } : {}),
  })
}

function makeAuthClient(companyId: string | null = 'company-1') {
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
            .mockResolvedValue({ data: companyId ? { id: companyId } : null, error: null }),
        }),
      }),
    }),
  }
}

describe('generate-estimate route (HTTP layer)', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { rateLimit } = await import('@/lib/ratelimit')
    vi.mocked(rateLimit).mockResolvedValue({ allowed: true, count: 0, max: 100 })
    const { checkQuota } = await import('@/lib/quota')
    vi.mocked(checkQuota).mockResolvedValue({ allowed: true, remaining: 5 })
    mockSend.mockResolvedValue({ ids: ['evt_abc'] } as never)
    // Default: a resolvable active company; the "no company" case overrides to null.
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

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({ data: { claims: null } }),
      },
    } as never)

    const res = await POST(makeRequest('project-1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when no company found', async () => {
    vi.mocked(createClient).mockResolvedValue(makeAuthClient(null) as never)
    vi.mocked(getActiveCompanyId).mockResolvedValue(null)

    const res = await POST(makeRequest('project-1'))
    // XtimatorError 'not_found' → 404 via asResponse
    expect(res.status).toBe(404)
  })

  it('returns 400 when projectId is missing', async () => {
    vi.mocked(createClient).mockResolvedValue(makeAuthClient() as never)

    const res = await POST(makeRequest())
    expect(res.status).toBe(400)
    const body = await res.json()
    // Bad-request user message from XtimatorError → mapped via lib/errors
    expect(body.code).toMatch(/bad_request/)
  })

  it('dispatches via Inngest and returns 202 + jobId (no inline AI call)', async () => {
    vi.mocked(createClient).mockResolvedValue(makeAuthClient() as never)

    const res = await POST(makeRequest('project-1'))

    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.jobId).toBe('evt_abc')
    expect(vi.mocked(generateEstimateForProject)).not.toHaveBeenCalled()
    expect(mockSend).toHaveBeenCalledOnce()
  })
})
