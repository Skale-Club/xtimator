// tests/unit/api/analyze-photos-quota.test.ts
// Phase 57: Quota enforcement tests for analyze-photos route.
// RED: Tests will fail until checkQuota/recordUsage are wired into the route.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Class-based factory — matches handler.test.ts pattern
const mockAnthropicCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: (...args: unknown[]) => mockAnthropicCreate(...args) }
  },
}))

vi.mock('@/lib/quota', () => ({
  checkQuota: vi.fn(),
  recordUsage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, count: 0, max: 100, retryAfter: null }),
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
import { requireServiceClient } from '@/lib/supabase/service'
import { checkQuota, recordUsage } from '@/lib/quota'

const mockCheckQuota = vi.mocked(checkQuota)
const mockRecordUsage = vi.mocked(recordUsage)

function makeRequest(projectId?: string) {
  return new Request('http://localhost/api/analyze-photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectId ? { projectId } : {}),
  })
}

const PHOTO_ROWS = [
  { id: 'photo-1', storage_path: 'company-1/proj-1/photo1.jpg', sort_order: 0, project_id: 'proj-1', ai_description: null },
  { id: 'photo-2', storage_path: 'company-1/proj-1/photo2.jpg', sort_order: 1, project_id: 'proj-1', ai_description: null },
]

function makeSupabaseMock() {
  const updateChain = {
    eq: vi.fn().mockResolvedValue({ error: null }),
  }
  const fromMock = vi.fn().mockImplementation((table: string) => {
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
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: PHOTO_ROWS, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue(updateChain),
      }
    }
    return {}
  })
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: 'user-1' } },
      }),
    },
    from: fromMock,
  }
}

function makeServiceClientMock() {
  return {
    storage: {
      from: vi.fn().mockReturnValue({
        download: vi.fn().mockResolvedValue({
          data: new Blob(['fake image data'], { type: 'image/jpeg' }),
          error: null,
        }),
      }),
    },
  }
}

describe('analyze-photos route — quota enforcement', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(recordUsage).mockResolvedValue(undefined)
  })

  // Test A: quota exceeded → 402
  it('returns 402 with plan_limit_reached body when quota is exceeded', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    vi.mocked(requireServiceClient).mockReturnValue(makeServiceClientMock() as never)
    mockCheckQuota.mockResolvedValue({ allowed: false, remaining: 0 })

    const res = await POST(makeRequest('proj-1'))

    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body).toEqual({ error: 'plan_limit_reached', upgradeUrl: '/settings/billing' })
  })

  // Test B: quota exceeded → Anthropic NOT called
  it('does not call anthropic.messages.create when quota is exceeded', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    vi.mocked(requireServiceClient).mockReturnValue(makeServiceClientMock() as never)
    mockCheckQuota.mockResolvedValue({ allowed: false, remaining: 0 })

    await POST(makeRequest('proj-1'))

    expect(mockAnthropicCreate).not.toHaveBeenCalled()
  })

  // Test C: allowed → recordUsage called with photo count
  it('calls recordUsage with photo_analyzed and correct photo count after successful analysis', async () => {
    const supabaseMock = makeSupabaseMock()
    vi.mocked(createClient).mockResolvedValue(supabaseMock as never)
    vi.mocked(requireServiceClient).mockReturnValue(makeServiceClientMock() as never)
    mockCheckQuota.mockResolvedValue({ allowed: true, remaining: null })
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Photo description from Claude Vision.' }],
    })

    await POST(makeRequest('proj-1'))

    expect(mockRecordUsage).toHaveBeenCalledOnce()
    expect(mockRecordUsage).toHaveBeenCalledWith(
      supabaseMock,
      'company-1',
      'photo_analyzed',
      2, // PHOTO_ROWS.length
      expect.any(String)
    )
  })
})
