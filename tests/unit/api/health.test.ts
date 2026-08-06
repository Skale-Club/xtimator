import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * HETZNER-04: GET /api/health liveness + readiness endpoint.
 *
 * Plan 68-02 ships this endpoint as the smoke check used by:
 *   - Docker HEALTHCHECK directive (Plan 68-01 Dockerfile)
 *   - The Hetzner runbook smoke step (Plan 68-02 docs/HETZNER-DEPLOY.md)
 *   - Future external uptime monitor (deferred to v3.2)
 *
 * Contract:
 *   - 200 + { ok: true, db: 'ok', storage: 'ok', commit } on happy path
 *   - 503 + { ok: false, db: 'fail', storage: 'ok', commit, error } when DB SELECT fails
 *   - 503 + { ok: false, db: 'ok', storage: 'fail', commit, error } when storage list fails
 *   - `commit` field reflects process.env.GIT_SHA (falls back to 'unknown')
 *   - MUST go through getServerStorage() (Phase 66 abstraction, moved to
 *     @/lib/storage/server in Phase 188 Plan 01) — no direct
 *     supabase.storage.from(...) call
 */

vi.mock('@/lib/storage/server', () => ({
  getServerStorage: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
  requireServiceClient: vi.fn(),
}))

import { GET } from '@/app/api/health/route'
import { getServerStorage } from '@/lib/storage/server'
import { createServiceClient } from '@/lib/supabase/service'

function makeSupabaseOk() {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  }
}

function makeSupabaseFailing(message = 'DB unreachable') {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi
          .fn()
          .mockResolvedValue({ error: { message } }),
      }),
    }),
  }
}

function makeStorageOk() {
  return {
    list: vi.fn().mockResolvedValue([]),
  }
}

function makeStorageFailing(message = 'storage 503') {
  return {
    list: vi.fn().mockRejectedValue(new Error(message)),
  }
}

describe('HETZNER-04: GET /api/health', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.GIT_SHA = 'test-sha-123'
  })

  afterEach(() => {
    delete process.env.GIT_SHA
  })

  it('returns 200 with { ok: true, db: ok, storage: ok, commit } on happy path', async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeSupabaseOk() as never)
    vi.mocked(getServerStorage).mockReturnValue(makeStorageOk() as never)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      ok: true,
      db: 'ok',
      storage: 'ok',
      commit: 'test-sha-123',
    })
    expect(body.error).toBeUndefined()
  })

  it('calls getServerStorage().list("logos", "") to verify storage liveness', async () => {
    const storage = makeStorageOk()
    vi.mocked(createServiceClient).mockReturnValue(makeSupabaseOk() as never)
    vi.mocked(getServerStorage).mockReturnValue(storage as never)

    await GET()
    expect(storage.list).toHaveBeenCalledWith('logos', '')
  })

  it('returns 503 with { ok: false, db: fail } when DB SELECT errors', async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      makeSupabaseFailing('connection refused') as never,
    )
    vi.mocked(getServerStorage).mockReturnValue(makeStorageOk() as never)

    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.db).toBe('fail')
    expect(body.storage).toBe('ok')
    expect(body.commit).toBe('test-sha-123')
    expect(body.error).toMatch(/db:.*connection refused/)
  })

  it('returns 503 with { ok: false, storage: fail } when storage list throws', async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeSupabaseOk() as never)
    vi.mocked(getServerStorage).mockReturnValue(
      makeStorageFailing('bucket missing') as never,
    )

    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.db).toBe('ok')
    expect(body.storage).toBe('fail')
    expect(body.commit).toBe('test-sha-123')
    expect(body.error).toMatch(/storage:.*bucket missing/)
  })

  it('falls back to commit "unknown" when GIT_SHA is unset', async () => {
    delete process.env.GIT_SHA
    vi.mocked(createServiceClient).mockReturnValue(makeSupabaseOk() as never)
    vi.mocked(getServerStorage).mockReturnValue(makeStorageOk() as never)

    const res = await GET()
    const body = await res.json()
    expect(body.commit).toBe('unknown')
  })

  it('returns 503 with both failures aggregated in error string', async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      makeSupabaseFailing('db down') as never,
    )
    vi.mocked(getServerStorage).mockReturnValue(
      makeStorageFailing('storage down') as never,
    )

    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.db).toBe('fail')
    expect(body.storage).toBe('fail')
    expect(body.error).toMatch(/db:.*db down/)
    expect(body.error).toMatch(/storage:.*storage down/)
  })

  it('returns 503 with { db: fail } when createServiceClient throws (env missing)', async () => {
    vi.mocked(createServiceClient).mockImplementation(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
    })
    vi.mocked(getServerStorage).mockReturnValue(makeStorageOk() as never)

    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.db).toBe('fail')
    expect(body.storage).toBe('ok')
    expect(body.error).toMatch(/db:.*SUPABASE_SERVICE_ROLE_KEY missing/)
  })
})
