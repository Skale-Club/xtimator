import { describe, it, expect, vi, beforeEach } from 'vitest'

// Billing v2: the credit gate now runs on every request — stub it permissive so
// these tests stay focused on their own contract (the gate has its own tests).
vi.mock('@/lib/billing/credit-ledger', () => ({
  // plain async fn (not vi.fn) so global mock resets can never strip the value
  checkCredits: async () => ({ allowed: true, balance: 1000, shortfall: 0 }),
}))

/**
 * INNGEST-04: POST /api/analyze-photos dispatches via Inngest (Wave 1 GREEN).
 *
 * Plan 67-03 refactored app/api/analyze-photos/route.ts. Contract:
 *   - returns { jobId } HTTP 202 in <1s
 *   - runs checkQuota BEFORE inngest.send() (failed quota never enqueues a job)
 *   - does NOT call Anthropic SDK directly (Vision call lives in Inngest function)
 */

const mockAnthropicCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: (...args: unknown[]) => mockAnthropicCreate(...args) }
  },
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: vi.fn(),
  },
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

// Pre-launch audit fix (M-3): the route resolves the caller's company via
// getActiveCompanyId() (company_members-based, works for staff) instead of
// the old companies.user_id = claims.sub lookup.
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn().mockResolvedValue('company-1'),
}))

import { POST } from '@/app/api/analyze-photos/route'
import { createClient } from '@/lib/supabase/server'
import { checkQuota } from '@/lib/quota'
import { inngest } from '@/lib/inngest/client'
import { getActiveCompanyId } from '@/lib/queries/active-company'

const mockSend = vi.mocked(inngest.send)
const mockCheckQuota = vi.mocked(checkQuota)
const mockGetActiveCompanyId = vi.mocked(getActiveCompanyId)

function makeRequest(projectId?: string) {
  return new Request('http://localhost/api/analyze-photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectId ? { projectId } : {}),
  })
}

function makeSupabaseMock(opts: { photoCount?: number } = {}) {
  const { photoCount = 2 } = opts
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
              single: vi
                .fn()
                .mockResolvedValue({ data: { id: 'company-1' }, error: null }),
            }),
          }),
        }
      }
      if (table === 'photos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi
              .fn()
              .mockResolvedValue({ count: photoCount, data: null, error: null }),
          }),
        }
      }
      return {}
    }),
  }
}

describe('INNGEST-04: POST /api/analyze-photos dispatch', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { rateLimit } = await import('@/lib/ratelimit')
    vi.mocked(rateLimit).mockResolvedValue({
      allowed: true,
      count: 0,
      max: 100,
    })
    mockSend.mockResolvedValue({ ids: ['evt_photos_xyz'] } as never)
    mockCheckQuota.mockResolvedValue({ allowed: true, remaining: null })
    mockGetActiveCompanyId.mockResolvedValue('company-1')
  })

  it('returns { jobId } HTTP 202 in <1s', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    const start = Date.now()
    const res = await POST(makeRequest('proj-1'))
    const elapsed = Date.now() - start

    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body).toEqual({ jobId: 'evt_photos_xyz' })
    expect(elapsed).toBeLessThan(1000)
  })

  it('runs checkQuota BEFORE inngest.send() — failed quota does not enqueue', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    mockCheckQuota.mockResolvedValue({ allowed: false, remaining: 0 })

    const res = await POST(makeRequest('proj-1'))

    expect(res.status).toBe(402)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('does NOT call Anthropic SDK directly (Vision moved into Inngest function)', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    await POST(makeRequest('proj-1'))

    expect(mockAnthropicCreate).not.toHaveBeenCalled()
  })

  it('calls inngest.send() with name "photos/analyze.requested" and event id "photos-{projectId}-..."', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    await POST(makeRequest('proj-1'))

    expect(mockSend).toHaveBeenCalledOnce()
    const payload = mockSend.mock.calls[0][0] as {
      name: string
      id: string
      data: { companyId: string; projectId: string; requestId: string }
    }
    expect(payload.name).toBe('photos/analyze.requested')
    expect(payload.id).toMatch(/^photos-proj-1-/)
    expect(payload.data.companyId).toBe('company-1')
    expect(payload.data.projectId).toBe('proj-1')
  })

  it('returns 429 when rateLimit denies', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    const { rateLimit } = await import('@/lib/ratelimit')
    vi.mocked(rateLimit).mockResolvedValue({
      allowed: false,
      count: 11,
      max: 10,
      retryAfter: 30,
    })

    const res = await POST(makeRequest('proj-1'))

    expect(res.status).toBe(429)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('returns 400 when no photos exist for the project', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({ photoCount: 0 }) as never
    )

    const res = await POST(makeRequest('proj-1'))

    expect(res.status).toBe(400)
    expect(mockSend).not.toHaveBeenCalled()
  })
})
