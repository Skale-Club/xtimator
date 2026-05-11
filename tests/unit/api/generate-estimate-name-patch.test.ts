import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/services/generate-estimate', () => ({
  generateEstimateForProject: vi.fn(),
}))

import { POST } from '@/app/api/generate-estimate/route'
import { createClient } from '@/lib/supabase/server'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'

function makeRequest(projectId?: string) {
  return new Request('http://localhost/api/generate-estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectId ? { projectId } : {}),
  })
}

function makeAuthClient(companyId = 'company-1') {
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

describe('generate-estimate route (HTTP layer)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
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

  it('returns 401 when no company found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'user-1' } },
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as never)

    const res = await POST(makeRequest('project-1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when projectId is missing', async () => {
    vi.mocked(createClient).mockResolvedValue(makeAuthClient() as never)

    const res = await POST(makeRequest())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/projectId/)
  })

  it('delegates to generateEstimateForProject and returns result', async () => {
    vi.mocked(createClient).mockResolvedValue(makeAuthClient() as never)
    vi.mocked(generateEstimateForProject).mockResolvedValue({
      estimateId: 'estimate-1',
      version: 1,
      clientSuggestion: null,
      language: 'en',
    })

    const res = await POST(makeRequest('project-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.estimateId).toBe('estimate-1')
    expect(body.version).toBe(1)
    expect(vi.mocked(generateEstimateForProject)).toHaveBeenCalledWith('company-1', 'project-1')
  })

  it('returns 400 for known client errors from the service', async () => {
    vi.mocked(createClient).mockResolvedValue(makeAuthClient() as never)
    vi.mocked(generateEstimateForProject).mockRejectedValue(
      new Error('At least one audio transcript or photo is required')
    )

    const res = await POST(makeRequest('project-1'))
    expect(res.status).toBe(400)
  })

  it('returns 500 for unexpected service errors', async () => {
    vi.mocked(createClient).mockResolvedValue(makeAuthClient() as never)
    vi.mocked(generateEstimateForProject).mockRejectedValue(new Error('DB exploded'))

    const res = await POST(makeRequest('project-1'))
    expect(res.status).toBe(500)
  })
})
