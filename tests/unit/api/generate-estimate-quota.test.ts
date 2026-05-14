// tests/unit/api/generate-estimate-quota.test.ts
// Phase 57: Quota enforcement tests for generate-estimate route.
// RED: Tests will fail until checkQuota/recordUsage are wired into the route.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/quota', () => ({
  checkQuota: vi.fn(),
  recordUsage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/services/generate-estimate', () => ({
  generateEstimateForProject: vi.fn(),
}))

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, count: 0, max: 100, retryAfter: null }),
}))

vi.mock('@/lib/errors', () => ({
  XtimatorError: class XtimatorError extends Error {
    constructor(public code: string, public surface: string, message: string) {
      super(message)
    }
  },
  asResponse: vi.fn((err) => Response.json({ error: String(err) }, { status: 500 })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { POST } from '@/app/api/generate-estimate/route'
import { createClient } from '@/lib/supabase/server'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { checkQuota, recordUsage } from '@/lib/quota'

const mockCheckQuota = vi.mocked(checkQuota)
const mockRecordUsage = vi.mocked(recordUsage)
const mockGenerate = vi.mocked(generateEstimateForProject)

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

describe('generate-estimate route — quota enforcement', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Re-apply default for rateLimit mock after reset
    const { rateLimit } = vi.mocked({ rateLimit: vi.fn() })
    void rateLimit
    vi.mocked(recordUsage).mockResolvedValue(undefined)
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

  // Test B: quota exceeded → generateEstimateForProject NOT called
  it('does not call generateEstimateForProject when quota is exceeded', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    mockCheckQuota.mockResolvedValue({ allowed: false, remaining: 0 })

    await POST(makeRequest('proj-1'))

    expect(mockGenerate).not.toHaveBeenCalled()
  })

  // Test C: allowed → recordUsage called after success
  it('calls recordUsage with correct args after successful estimate generation', async () => {
    const supabaseMock = makeSupabaseMock('company-1')
    vi.mocked(createClient).mockResolvedValue(supabaseMock as never)
    mockCheckQuota.mockResolvedValue({ allowed: true, remaining: 5 })
    mockGenerate.mockResolvedValue({
      estimateId: 'est-1',
      version: 1,
      clientSuggestion: null,
      language: 'en',
    })

    await POST(makeRequest('proj-1'))

    expect(mockRecordUsage).toHaveBeenCalledOnce()
    expect(mockRecordUsage).toHaveBeenCalledWith(
      supabaseMock,
      'company-1',
      'estimate_generated',
      1,
      expect.any(String)
    )
  })

  // Test D: allowed but AI fails → recordUsage NOT called
  it('does not call recordUsage when generateEstimateForProject throws', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    mockCheckQuota.mockResolvedValue({ allowed: true, remaining: 5 })
    mockGenerate.mockRejectedValue(new Error('Project not found'))

    await POST(makeRequest('proj-1'))

    expect(mockRecordUsage).not.toHaveBeenCalled()
  })
})
