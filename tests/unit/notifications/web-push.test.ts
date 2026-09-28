import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * 260928: server-side Web Push. Sends each device a message in its own
 * language, prunes devices the push service says are gone, and never throws.
 */

const sendNotification = vi.fn()
vi.mock('web-push', () => ({ default: { sendNotification: (...a: unknown[]) => sendNotification(...a) } }))

let stored: unknown = null
const upsertUserPreferences = vi.fn(async (_id: string, patch: { push_subscription?: unknown }) => {
  stored = patch.push_subscription
})
vi.mock('@/lib/notifications/preferences', () => ({
  getUserPreferences: async () => ({ user_id: 'u1', push_subscription: stored }),
  upsertUserPreferences: (id: string, patch: { push_subscription?: unknown }) => upsertUserPreferences(id, patch),
}))

import { getVapidConfig, sendPushToUser } from '@/lib/notifications/web-push'

const device = (n: number, lang: 'en' | 'pt') => ({
  endpoint: `https://push.example.com/${n}`,
  keys: { p256dh: `p${n}`, auth: `a${n}` },
  lang,
})

const ENV = { ...process.env }
beforeEach(() => {
  vi.clearAllMocks()
  process.env.VAPID_PUBLIC_KEY = 'pub'
  process.env.VAPID_PRIVATE_KEY = 'priv'
  delete process.env.VAPID_SUBJECT
  stored = { v: 2, devices: [device(1, 'en'), device(2, 'pt')] }
})
afterEach(() => {
  process.env = { ...ENV }
})

const build = (lang: 'en' | 'pt' | 'es') => ({ title: `T-${lang}`, body: 'b', url: '/x', tag: 't' })

describe('sendPushToUser', () => {
  it('does nothing without both VAPID keys', async () => {
    delete process.env.VAPID_PRIVATE_KEY
    expect(getVapidConfig()).toBeNull()
    expect(await sendPushToUser('u1', build)).toEqual({ sent: 0, removed: 0, skipped: 'not_configured' })
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('reports no devices instead of failing', async () => {
    stored = null
    expect(await sendPushToUser('u1', build)).toMatchObject({ skipped: 'no_devices' })
  })

  it('sends every device the message in its own language, signed with the VAPID keys', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 })
    const result = await sendPushToUser('u1', build)
    expect(result).toEqual({ sent: 2, removed: 0 })
    const payloads = sendNotification.mock.calls.map((c) => JSON.parse(c[1] as string).title).sort()
    expect(payloads).toEqual(['T-en', 'T-pt'])
    expect(sendNotification.mock.calls[0][2]).toMatchObject({
      vapidDetails: { publicKey: 'pub', privateKey: 'priv' },
      urgency: 'high',
    })
  })

  it('removes a device the push service reports as gone, and keeps the rest', async () => {
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith('/1')) throw Object.assign(new Error('gone'), { statusCode: 410 })
      return { statusCode: 201 }
    })
    const result = await sendPushToUser('u1', build)
    expect(result).toEqual({ sent: 1, removed: 1 })
    expect(stored).toEqual({ v: 2, devices: [device(2, 'pt')] })
  })

  it('keeps a device after a transient failure', async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }))
    const result = await sendPushToUser('u1', build)
    expect(result).toEqual({ sent: 0, removed: 0 })
    expect(upsertUserPreferences).not.toHaveBeenCalled()
  })
})
