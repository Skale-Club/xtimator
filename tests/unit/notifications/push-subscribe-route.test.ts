import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * 260928: the Web Push subscribe route. Adds THIS device to the user's list
 * (a laptop no longer unsubscribes the phone), removes only the device that
 * unsubscribes, and refuses to store anything when push is not configured.
 */

const getAuthClaims = vi.fn()
vi.mock('@/lib/queries/auth', () => ({ getAuthClaims: () => getAuthClaims() }))
vi.mock('@/lib/demo/guard', () => ({ demoGuardResponse: vi.fn().mockResolvedValue(null) }))

let stored: unknown = null
vi.mock('@/lib/notifications/preferences', () => ({
  getUserPreferences: async () => ({ user_id: 'u1', push_subscription: stored }),
  upsertUserPreferences: async (_id: string, patch: { push_subscription?: unknown }) => {
    stored = patch.push_subscription
  },
}))

import { DELETE, GET, POST } from '@/app/api/notifications/push/subscribe/route'

const sub = (n: number) => ({ endpoint: `https://push.example.com/${n}`, keys: { p256dh: `p${n}`, auth: `a${n}` } })
const req = (method: string, body?: unknown) =>
  new Request('http://localhost/api/notifications/push/subscribe', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const ENV = { ...process.env }
beforeEach(() => {
  stored = null
  getAuthClaims.mockResolvedValue({ sub: 'u1' })
  process.env.VAPID_PUBLIC_KEY = 'pub-key'
  process.env.VAPID_PRIVATE_KEY = 'priv-key'
})
afterEach(() => {
  process.env = { ...ENV }
})

describe('push subscribe route', () => {
  it('serves the public key at runtime, and null when push is not configured', async () => {
    expect(await (await GET()).json()).toEqual({ publicKey: 'pub-key' })
    delete process.env.VAPID_PRIVATE_KEY
    expect(await (await GET()).json()).toEqual({ publicKey: null })
  })

  it('requires a signed-in user', async () => {
    getAuthClaims.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
    expect((await POST(req('POST', { subscription: sub(1) }))).status).toBe(401)
  })

  it('adds a second device instead of replacing the first', async () => {
    await POST(req('POST', { subscription: sub(1), lang: 'pt' }))
    const res = await POST(req('POST', { subscription: sub(2), lang: 'en' }))
    expect(res.status).toBe(204)
    const devices = (stored as { devices: Array<{ endpoint: string; lang: string }> }).devices
    expect(devices.map((d) => [d.endpoint.slice(-1), d.lang])).toEqual([
      ['1', 'pt'],
      ['2', 'en'],
    ])
  })

  it('rejects a malformed subscription', async () => {
    expect((await POST(req('POST', { subscription: { endpoint: 'nope' } }))).status).toBe(400)
  })

  it('refuses to store a device when push is not configured', async () => {
    delete process.env.VAPID_PUBLIC_KEY
    expect((await POST(req('POST', { subscription: sub(1) }))).status).toBe(503)
    expect(stored).toBeNull()
  })

  it('removes only the device that unsubscribes', async () => {
    await POST(req('POST', { subscription: sub(1) }))
    await POST(req('POST', { subscription: sub(2) }))
    await DELETE(req('DELETE', { endpoint: sub(1).endpoint }))
    expect((stored as { devices: Array<{ endpoint: string }> }).devices.map((d) => d.endpoint)).toEqual([sub(2).endpoint])
  })

  it('clears every device when no endpoint is given', async () => {
    await POST(req('POST', { subscription: sub(1) }))
    await DELETE(req('DELETE'))
    expect(stored).toBeNull()
  })
})
