import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  claims: { sub: 'user-1' } as { sub: string } | null,
  denied: null as { error: string } | null,
  prefs: null as {
    whatsapp_opt_in_at?: string | null
    categories?: Record<string, { whatsapp: boolean }>
  } | null,
  upsert: vi.fn().mockResolvedValue(undefined),
  welcome: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/queries/auth', () => ({ getAuthClaims: async () => mocks.claims }))
vi.mock('@/lib/demo/guard', () => ({ assertWritable: async () => mocks.denied }))
vi.mock('@/lib/notifications/preferences', () => ({
  readUserPreferences: async () => mocks.prefs,
  upsertUserPreferences: mocks.upsert,
}))

vi.mock('@/lib/whatsapp/welcome-template', () => ({
  sendWelcomeTemplateForUser: mocks.welcome,
}))

import { recordWhatsAppOptIn, recordWhatsAppOptOut } from '@/lib/actions/whatsapp-consent'

const enabledCategories = {
  estimate: { whatsapp: true },
  billing: { whatsapp: true },
  system: { whatsapp: true },
}

beforeEach(() => {
  mocks.claims = { sub: 'user-1' }
  mocks.denied = null
  mocks.prefs = null
  mocks.upsert.mockReset().mockResolvedValue(undefined)
  mocks.welcome.mockClear()
})

describe('recordWhatsAppOptIn', () => {
  it('stores whatsapp_opt_in_at for the signed-in user', async () => {
    await expect(recordWhatsAppOptIn()).resolves.toEqual({ ok: true })
    expect(mocks.upsert).toHaveBeenCalledWith('user-1', {
      whatsapp_opt_in_at: expect.any(String),
      categories: enabledCategories,
    })
    expect(mocks.welcome).toHaveBeenCalledWith('user-1')
  })

  it('keeps an existing consent timestamp (idempotent)', async () => {
    mocks.prefs = { whatsapp_opt_in_at: '2026-11-01T00:00:00Z', categories: enabledCategories }
    await expect(recordWhatsAppOptIn()).resolves.toEqual({ ok: true })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('enables categories for legacy consent without rewriting its timestamp', async () => {
    mocks.prefs = { whatsapp_opt_in_at: '2026-11-01T00:00:00Z' }
    await expect(recordWhatsAppOptIn()).resolves.toEqual({ ok: true })
    expect(mocks.upsert).toHaveBeenCalledWith('user-1', {
      whatsapp_opt_in_at: '2026-11-01T00:00:00Z',
      categories: enabledCategories,
    })
  })

  it('reports failed writes and does not send a welcome', async () => {
    mocks.upsert.mockRejectedValue(new Error('database failure'))
    expect(await recordWhatsAppOptIn()).toEqual({ error: expect.stringMatching(/Could not save/) })
    expect(mocks.welcome).not.toHaveBeenCalled()
  })

  it('revokes recorded consent and all three WhatsApp categories', async () => {
    mocks.prefs = { whatsapp_opt_in_at: '2026-11-01T00:00:00Z', categories: enabledCategories }
    await expect(recordWhatsAppOptOut()).resolves.toEqual({ ok: true })
    expect(mocks.upsert).toHaveBeenCalledWith('user-1', {
      whatsapp_opt_in_at: null,
      categories: {
        estimate: { whatsapp: false }, billing: { whatsapp: false }, system: { whatsapp: false },
      },
    })
    expect(mocks.welcome).not.toHaveBeenCalled()
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
