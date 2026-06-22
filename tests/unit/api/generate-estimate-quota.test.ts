// tests/unit/api/generate-estimate-quota.test.ts
// Phase 67: After Inngest refactor, recordUsage moved into the Inngest function
// (see tests/unit/inngest/generate-estimate-job.test.ts). The route is now a
// dispatcher — it only enforces the quota GATE (402 when exceeded). The
// usage-recording contract is verified at the worker layer.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: vi.fn().mockResolvedValue({ ids: ['evt_test'] }),
  },
}))

vi.mock('@/lib/quota', () => ({
  checkQuota: vi.fn(),
  recordUsage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/services/generate-estimate', () => ({
  generateEstimateForProject: vi.fn(),
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

import { POST } from '@/app/api/generate-estimate/route'
import { createClient } from '@/lib/supabase/server'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { checkQuota, recordUsage } from '@/lib/quota'
import { inngest } from '@/lib/inngest/client'
import { getActiveCompanyId } from '@/lib/queries/active-company'

const mockCheckQuota = vi.mocked(checkQuota)
const mockRecordUsage = vi.mocked(recordUsage)
const mockGenerate = vi.mocked(generateEstimateForProject)
const mockSend = vi.mocked(inngest.send)

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
          single: vi.fn().mockResolvedValue({ data: { id: companyId }, error: null }),
        }),
      }),
    }),
  }
}

describe('generate-estimate route — quota enforcement (dispatcher contract)', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { rateLimit } = await import('@/lib/ratelimit')
    vi.mocked(rateLimit).mockResolvedValue({ allowed: true, count: 0, max: 100 })
    vi.mocked(recordUsage).mockResolvedValue(undefined)
    mockSend.mockResolvedValue({ ids: ['evt_test'] } as never)
    vi.mocked(getActiveCompanyId).mockResolvedValue('company-1')
  })

  // Test A: quota exceeded → 402
  it('returns 402 with plan_limit_reached body when quota is exceeded', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    mockCheckQuota.mockResolvedValue({ allowed: false, remaining: 0 })

    const res = await POST(makeRequest('proj-1'))

    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body).toEqual({ error: 'plan_limit_reached', upgradeUrl: '/settings/billing' })
  })

  // Test B: quota exceeded → no dispatch and no direct AI call
  it('does not dispatch (or call AI) when quota is exceeded', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    mockCheckQuota.mockResolvedValue({ allowed: false, remaining: 0 })

    await POST(makeRequest('proj-1'))

    expect(mockGenerate).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  // Test C: allowed → dispatches via Inngest (recordUsage now in worker, not route)
  it('dispatches to Inngest and does NOT call recordUsage inline (route is now dispatcher only)', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    mockCheckQuota.mockResolvedValue({ allowed: true, remaining: 5 })

    const res = await POST(makeRequest('proj-1'))

    expect(res.status).toBe(202)
    expect(mockSend).toHaveBeenCalledOnce()
    // recordUsage runs inside the Inngest function (see tests/unit/inngest/generate-estimate-job.test.ts)
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })
})
