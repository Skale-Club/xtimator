import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * REC-01: GET /api/jobs/[jobId] graceful discriminated-state contract.
 *
 * Phase 91 replaces the opaque 503/502/404 responses with a single
 * discriminated `state` contract that always returns HTTP 200 for every
 * KNOWN condition. Contract:
 *   - requires authentication (401 when no claims — this stays non-200)
 *   - proxies to https://api.inngest.com/v1/events/{jobId}/runs with
 *     `Authorization: Bearer ${INNGEST_SIGNING_KEY}` header
 *   - uses cache: 'no-store' (status changes constantly)
 *   - 200 { state: 'config_unavailable' } when signing key absent (was 503)
 *   - 200 { state: 'completed', output } when Inngest run Completed
 *   - 200 { state: 'processing' } when run not started / Running
 *   - 200 { state: 'not_found' } when Inngest returns 404 (was 404)
 *   - 200 { state: 'failed', reason } when Inngest API errors (was 502)
 *   - 200 { state: 'failed', reason } when run status is Failed/Cancelled
 *
 * Why proxy? Browser must never see INNGEST_SIGNING_KEY.
 * Why 200 everywhere? The capture popup polls every ~1.5s; any non-200 makes
 * the hook throw — that's the REC-01 bug.
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

  it('returns 200 { state: config_unavailable } when INNGEST_SIGNING_KEY is not set', async () => {
    delete process.env.INNGEST_SIGNING_KEY
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    const res = await GET(
      new Request('http://localhost/api/jobs/evt_xyz'),
      makeParams('evt_xyz')
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ state: 'config_unavailable' })
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

  it('returns 200 { state: completed, output } when Inngest run is Completed', async () => {
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
      state: 'completed',
      output: { estimateId: 'est-1' },
    })
  })

  it('returns 200 { state: not_found } when Inngest returns 404 (folded)', async () => {
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

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ state: 'not_found' })
  })

  it('returns 200 { state: processing } when run has not started yet (empty data array)', async () => {
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
    expect(body).toEqual({ state: 'processing' })
  })

  it('returns 200 { state: failed, reason } when Inngest returns a non-404 error (folded from 502)', async () => {
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

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.state).toBe('failed')
    expect(typeof body.reason).toBe('string')
    expect(body.reason.length).toBeGreaterThan(0)
  })

  it('returns 200 { state: failed, reason } when the Inngest run status is Failed', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [{ status: 'Failed', output: 'OPENROUTER_API_KEY missing' }],
        }),
    })

    const res = await GET(
      new Request('http://localhost/api/jobs/evt_xyz'),
      makeParams('evt_xyz')
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.state).toBe('failed')
    expect(typeof body.reason).toBe('string')
    expect(body.reason.length).toBeGreaterThan(0)
  })
})
