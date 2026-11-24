import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getIntegrationKey = vi.hoisted(() => vi.fn())
vi.mock('@/lib/platform-config', () => ({ getIntegrationKey }))
import { exchangeCode, deauthorize } from '@/lib/billing/connect-oauth'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('DATA_API_MODE', 'supabase')
  vi.stubGlobal('fetch', fetchMock)
  getIntegrationKey.mockResolvedValue('sk_test_fixture')
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({
    stripe_user_id: 'acct_fixture', livemode: false, scope: 'read_write',
  }), { status: 200 }))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Connect OAuth environment boundary', () => {
  it('uses the stored sandbox credential for both exchange and deauthorization in development', async () => {
    await expect(exchangeCode('authorization_fixture')).resolves.toMatchObject({ stripe_user_id: 'acct_fixture', livemode: false })
    await deauthorize({ clientId: 'ca_fixture', stripeUserId: 'acct_fixture' })
    expect(getIntegrationKey).toHaveBeenCalledTimes(2)
    expect(getIntegrationKey.mock.calls.every(([provider]) => provider === 'stripe_test')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [, request] of fetchMock.mock.calls) {
      expect(request.headers.Authorization).toBe(`Basic ${Buffer.from('sk_test_fixture:').toString('base64')}`)
    }
  })

  it('blocks a live credential in development before either OAuth HTTP request', async () => {
    getIntegrationKey.mockResolvedValue('sk_live_fixture')
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(exchangeCode('authorization_fixture')).rejects.toThrow('Live Stripe access is disabled outside production')
    await expect(deauthorize({ clientId: 'ca_fixture', stripeUserId: 'acct_fixture' })).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never falls back to a live credential when no sandbox credential is configured', async () => {
    getIntegrationKey.mockImplementation(async provider => provider === 'stripe' ? 'sk_live_fixture' : null)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(exchangeCode('authorization_fixture')).rejects.toThrow('Sandbox secret key not configured')
    await deauthorize({ clientId: 'ca_fixture', stripeUserId: 'acct_fixture' })
    expect(getIntegrationKey.mock.calls.every(([provider]) => provider === 'stripe_test')).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
