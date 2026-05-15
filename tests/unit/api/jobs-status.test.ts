import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * INNGEST-05: GET /api/jobs/[jobId] proxy route (Wave 1 GREEN).
 *
 * Plan 67-03 delivered app/api/jobs/[jobId]/route.ts. Contract:
 *   - requires authentication (401 when no claims)
 *   - proxies to https://api.inngest.com/v1/events/{jobId}/runs with
 *     `Authorization: Bearer ${INNGEST_SIGNING_KEY}` header
 *   - uses cache: 'no-store' (status changes constantly)
 *   - returns { status, output } shape — status one of
 *     'Running' | 'Completed' | 'Failed' | 'Cancelled'
 *   - 404 when Inngest returns 404
 *   - { status: 'Running', output: null } when run hasn't started yet
 *
 * Why proxy? Browser must never see INNGEST_SIGNING_KEY.
 */

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { GET } from '@/app/api/jobs/[jobId]/route'
import { createClient } from '@/lib/supabase/server'

const mockFetch = vi.fn()

function makeSupabaseMock(unauth = false) {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: unauth ? null : { sub: 'user-1' } },
      }),
    },
  }
}

function makeParams(jobId: string) {
  return { params: Promise.resolve({ jobId }) }
}

describe('INNGEST-05: GET /api/jobs/[jobId] proxy', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    process.env.INNGEST_SIGNING_KEY = 'test-signing-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.INNGEST_SIGNING_KEY
  })

  it('requires authentication (401 when no claims)', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock(true) as never)

    const res = await GET(
      new Request('http://localhost/api/jobs/evt_xyz'),
      makeParams('evt_xyz')
    )

    expect(res.status).toBe(401)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns 503 when INNGEST_SIGNING_KEY is not set', async () => {
    delete process.env.INNGEST_SIGNING_KEY
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    const res = await GET(
      new Request('http://localhost/api/jobs/evt_xyz'),
      makeParams('evt_xyz')
    )

    expect(res.status).toBe(503)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('proxies to https://api.inngest.com/v1/events/{jobId}/runs with Bearer auth header and no-store cache', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [{ status: 'Running', output: null }],
        }),
    })

    await GET(
      new Request('http://localhost/api/jobs/evt_xyz'),
      makeParams('evt_xyz')
    )

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.inngest.com/v1/events/evt_xyz/runs')
    expect(init.headers).toEqual({ Authorization: 'Bearer test-signing-key' })
    expect(init.cache).toBe('no-store')
  })

  it('returns { status, output } shape from Inngest run data', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              status: 'Completed',
              output: { estimateId: 'est-1' },
            },
          ],
        }),
    })

    const res = await GET(
      new Request('http://localhost/api/jobs/evt_xyz'),
      makeParams('evt_xyz')
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      status: 'Completed',
      output: { estimateId: 'est-1' },
    })
  })

  it('returns 404 when Inngest returns 404', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    })

    const res = await GET(
      new Request('http://localhost/api/jobs/evt_missing'),
      makeParams('evt_missing')
    )

    expect(res.status).toBe(404)
  })

  it('returns { status: "Running", output: null } when run has not started yet (empty data array)', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    })

    const res = await GET(
      new Request('http://localhost/api/jobs/evt_xyz'),
      makeParams('evt_xyz')
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'Running', output: null })
  })

  it('returns 502 when Inngest returns a non-404 error', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    })

    const res = await GET(
      new Request('http://localhost/api/jobs/evt_xyz'),
      makeParams('evt_xyz')
    )

    expect(res.status).toBe(502)
  })
})
