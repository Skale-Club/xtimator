import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  claims: { sub: 'user-1' } as { sub: string } | null,
  denied: null as { error: string } | null,
  prefs: null as { whatsapp_opt_in_at?: string | null } | null,
  upsert: vi.fn().mockResolvedValue(undefined),
  welcome: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/queries/auth', () => ({ getAuthClaims: async () => mocks.claims }))
vi.mock('@/lib/demo/guard', () => ({ assertWritable: async () => mocks.denied }))
vi.mock('@/lib/notifications/preferences', () => ({
  getUserPreferences: async () => mocks.prefs,
  upsertUserPreferences: mocks.upsert,
}))

vi.mock('@/lib/whatsapp/welcome-template', () => ({
  sendWelcomeTemplateForUser: mocks.welcome,
}))

import { recordWhatsAppOptIn } from '@/lib/actions/whatsapp-consent'

beforeEach(() => {
  mocks.claims = { sub: 'user-1' }
  mocks.denied = null
  mocks.prefs = null
  mocks.upsert.mockClear()
  mocks.welcome.mockClear()
})

describe('recordWhatsAppOptIn', () => {
  it('stores whatsapp_opt_in_at for the signed-in user', async () => {
    await expect(recordWhatsAppOptIn()).resolves.toEqual({ ok: true })
    expect(mocks.upsert).toHaveBeenCalledWith('user-1', { whatsapp_opt_in_at: expect.any(String) })
    expect(mocks.welcome).toHaveBeenCalledWith('user-1')
  })

  it('keeps an existing consent timestamp (idempotent)', async () => {
    mocks.prefs = { whatsapp_opt_in_at: '2026-11-01T00:00:00Z' }
    await expect(recordWhatsAppOptIn()).resolves.toEqual({ ok: true })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('refuses unauthenticated callers and demo (read-only) users', async () => {
    mocks.claims = null
    expect(await recordWhatsAppOptIn()).toEqual({ error: 'Not authenticated' })
    mocks.claims = { sub: 'user-1' }
    mocks.denied = { error: 'demo' }
    expect(await recordWhatsAppOptIn()).toEqual({ error: 'demo' })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})
