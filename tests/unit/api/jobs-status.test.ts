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
 *
 * Pre-launch audit fix (B4): the route now also checks that the polling
 * user's active company matches the company that dispatched this jobId
 * (lib/inngest/job-ownership.ts). A mismatch or unknown jobId folds into the
 * existing `not_found` state — see the "ownership" describe block below.
 */

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(),
}))

vi.mock('@/lib/inngest/job-ownership', () => ({
  getJobOwnerCompanyId: vi.fn(),
}))

import { GET } from '@/app/api/jobs/[jobId]/route'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { getJobOwnerCompanyId } from '@/lib/inngest/job-ownership'

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
  // The route added an isDevMode() branch (reads INNGEST_DEV): in dev mode it
  // targets http://localhost:8288 and SKIPS the config_unavailable path. The
  // local .env.local (loaded by tests/setup/load-env.ts) sets INNGEST_DEV=1, so
  // without clearing it these assertions (cloud URL + config_unavailable) test
  // the wrong branch. Force the non-dev (cloud) contract these tests describe.
  let savedInngestDev: string | undefined
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    savedInngestDev = process.env.INNGEST_DEV
    delete process.env.INNGEST_DEV
    process.env.INNGEST_SIGNING_KEY = 'test-signing-key'
    // Default: caller's active company matches the job's recorded owner, so
    // existing tests below continue to exercise the Inngest-proxy contract
    // unchanged. The "ownership" describe block overrides these per-case.
    vi.mocked(getActiveCompanyId).mockResolvedValue('company-1')
    vi.mocked(getJobOwnerCompanyId).mockResolvedValue('company-1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.INNGEST_SIGNING_KEY
    if (savedInngestDev === undefined) delete process.env.INNGEST_DEV
    else process.env.INNGEST_DEV = savedInngestDev
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

  describe('B4: cross-tenant ownership check', () => {
    it('returns 200 { state: not_found } when the jobId belongs to a different company (never reaches Inngest)', async () => {
      vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
      vi.mocked(getActiveCompanyId).mockResolvedValue('company-1')
      vi.mocked(getJobOwnerCompanyId).mockResolvedValue('company-2') // someone else's job

      const res = await GET(
        new Request('http://localhost/api/jobs/evt_other_tenant'),
        makeParams('evt_other_tenant')
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ state: 'not_found' })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('returns 200 { state: not_found } when the jobId has no recorded owner (unknown/legacy job)', async () => {
      vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
      vi.mocked(getActiveCompanyId).mockResolvedValue('company-1')
      vi.mocked(getJobOwnerCompanyId).mockResolvedValue(null)

      const res = await GET(
        new Request('http://localhost/api/jobs/evt_unknown'),
        makeParams('evt_unknown')
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ state: 'not_found' })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('returns 200 { state: not_found } when the caller has no active company', async () => {
      vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
      vi.mocked(getActiveCompanyId).mockResolvedValue(null)
      vi.mocked(getJobOwnerCompanyId).mockResolvedValue('company-2')

      const res = await GET(
        new Request('http://localhost/api/jobs/evt_xyz'),
        makeParams('evt_xyz')
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ state: 'not_found' })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('proceeds to the Inngest proxy when the owning company matches the caller', async () => {
      vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
      vi.mocked(getActiveCompanyId).mockResolvedValue('company-1')
      vi.mocked(getJobOwnerCompanyId).mockResolvedValue('company-1')
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [{ status: 'Running', output: null }] }),
      })

      const res = await GET(
        new Request('http://localhost/api/jobs/evt_xyz'),
        makeParams('evt_xyz')
      )

      expect(res.status).toBe(200)
      expect(mockFetch).toHaveBeenCalledOnce()
    })
  })
})
