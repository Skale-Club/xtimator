import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/service', () => {
  // Route uses requireServiceClient(); alias both exports to one factory returning the rpc spy.
  const client = vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({ data: [{ deleted_count: 7 }], error: null }),
  }))
  return { createServiceClient: client, requireServiceClient: client }
})

describe('GET /api/cron/cleanup-orphan-projects', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns 503 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    const { GET } = await import('@/app/api/cron/cleanup-orphan-projects/route')
    const res = await GET(new Request('http://x', { headers: { authorization: 'Bearer anything' } }))
    expect(res.status).toBe(503)
  })

  it('returns 401 with missing or invalid Authorization header', async () => {
    process.env.CRON_SECRET = 'top-secret'
    const { GET } = await import('@/app/api/cron/cleanup-orphan-projects/route')
    const res1 = await GET(new Request('http://x'))
    expect(res1.status).toBe(401)
    const res2 = await GET(new Request('http://x', { headers: { authorization: 'Bearer wrong' } }))
    expect(res2.status).toBe(401)
  })

  it('returns 200 + deleted_count with valid Bearer token', async () => {
    process.env.CRON_SECRET = 'top-secret'
    const { GET } = await import('@/app/api/cron/cleanup-orphan-projects/route')
    const res = await GET(new Request('http://x', {
      headers: { authorization: 'Bearer top-secret' },
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deleted_count).toBe(7)
  })
})
