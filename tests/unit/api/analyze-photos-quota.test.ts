// tests/unit/api/analyze-photos-quota.test.ts
// Phase 67: After Inngest refactor, Anthropic Vision + recordUsage moved into
// the Inngest function (see tests/unit/inngest/analyze-photos-job.test.ts).
// The route is now a dispatcher — it only enforces auth/rate-limit/quota gates
// and dispatches the event. Vision/recordUsage assertions live at the worker layer.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAnthropicCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: (...args: unknown[]) => mockAnthropicCreate(...args) }
  },
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: vi.fn().mockResolvedValue({ ids: ['evt_test'] }),
  },
}))

vi.mock('@/lib/quota', () => ({
  checkQuota: vi.fn(),
  recordUsage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, count: 0, max: 100 }),
}))

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn().mockResolvedValue('test-anthropic-key'),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

import { POST } from '@/app/api/analyze-photos/route'
import { createClient } from '@/lib/supabase/server'
import { checkQuota, recordUsage } from '@/lib/quota'
import { inngest } from '@/lib/inngest/client'

const mockCheckQuota = vi.mocked(checkQuota)
const mockRecordUsage = vi.mocked(recordUsage)
const mockSend = vi.mocked(inngest.send)

function makeRequest(projectId?: string) {
  return new Request('http://localhost/api/analyze-photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectId ? { projectId } : {}),
  })
}

function makeSupabaseMock(photoCount = 2) {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: 'user-1' } },
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'company-1' }, error: null }),
            }),
          }),
        }
      }
      if (table === 'photos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: photoCount, data: null, error: null }),
          }),
        }
      }
      return {}
    }),
  }
}

describe('analyze-photos route — quota enforcement (dispatcher contract)', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { rateLimit } = await import('@/lib/ratelimit')
    vi.mocked(rateLimit).mockResolvedValue({ allowed: true, count: 0, max: 100 })
    vi.mocked(recordUsage).mockResolvedValue(undefined)
    mockSend.mockResolvedValue({ ids: ['evt_photos_test'] } as never)
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

  // Test B: quota exceeded → no Anthropic call and no dispatch
  it('does not call Anthropic or dispatch when quota is exceeded', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    mockCheckQuota.mockResolvedValue({ allowed: false, remaining: 0 })

    await POST(makeRequest('proj-1'))

    expect(mockAnthropicCreate).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  // Test C: allowed → dispatches via Inngest; route does NOT call recordUsage inline
  it('dispatches to Inngest and does NOT call recordUsage inline (lives in worker now)', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    mockCheckQuota.mockResolvedValue({ allowed: true, remaining: null })

    const res = await POST(makeRequest('proj-1'))

    expect(res.status).toBe(202)
    expect(mockSend).toHaveBeenCalledOnce()
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })
})
