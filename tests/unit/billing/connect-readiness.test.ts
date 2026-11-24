import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ key: vi.fn(), stripe: vi.fn(), endpoints: vi.fn() }))
vi.mock('@/lib/platform-config', () => ({ getIntegrationKey: mocks.key }))
vi.mock('@/lib/billing/stripe-client', () => ({ getStripeClient: mocks.stripe }))
vi.mock('@/lib/utils/site-url', () => ({ getCanonicalBaseUrl: () => 'https://xtimator.com' }))
import { checkConnectReadiness, CONNECT_WEBHOOK_EVENTS } from '@/lib/billing/connect-readiness'

const endpoint = (overrides: Record<string, unknown> = {}) => ({
  status: 'enabled', url: 'https://xtimator.com/api/webhooks/stripe',
  application: 'ca_platform', enabled_events: [...CONNECT_WEBHOOK_EVENTS], ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'whsec_fixture')
  mocks.key.mockResolvedValue('ca_platform')
  mocks.stripe.mockResolvedValue({ webhookEndpoints: { list: mocks.endpoints } })
  mocks.endpoints.mockResolvedValue({ data: [endpoint()] })
})
afterEach(() => vi.unstubAllEnvs())

describe('Connect production readiness', () => {
  it('requires a real Client ID, signing secret and complete connected-account destination', async () => {
    expect(await checkConnectReadiness()).toEqual({ ready: true, missing: [] })
    expect(mocks.key).toHaveBeenCalledWith('stripe_connect_client_id')
  })

  it.each([null, '', 'sk_live_placeholder', 'ca_bad id'])('fails closed for invalid Client ID %s before accessing Stripe', async (key) => {
    mocks.key.mockResolvedValue(key)
    expect(await checkConnectReadiness()).toEqual({ ready: false, missing: ['Connect application Client ID'] })
    expect(mocks.stripe).not.toHaveBeenCalled()
  })

  it('requires the Connect signing secret before accessing Stripe', async () => {
    vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', '')
    expect(await checkConnectReadiness()).toEqual({ ready: false, missing: ['Connect webhook signing secret'] })
    expect(mocks.stripe).not.toHaveBeenCalled()
  })

  it.each([
    { application: null },
    { application: 'ca_otherPlatform' },
    { status: 'disabled' },
    { url: 'https://other.example/api/webhooks/stripe' },
    { enabled_events: ['invoice.paid'] },
    { enabled_events: CONNECT_WEBHOOK_EVENTS.filter(event => event !== 'account.application.deauthorized') },
  ])('refuses a platform-only, inactive, wrong-URL or incomplete destination: %o', async (invalid) => {
    mocks.endpoints.mockResolvedValue({ data: [endpoint(invalid)] })
    expect(await checkConnectReadiness()).toEqual({ ready: false, missing: ['Connected-account webhook destination and events'] })
  })

  it('accepts all events only on a matching connected-account destination', async () => {
    mocks.endpoints.mockResolvedValue({ data: [endpoint({ enabled_events: ['*'] })] })
    expect((await checkConnectReadiness()).ready).toBe(true)
  })

  it('does not substitute a partial destination when another complete one exists', async () => {
    mocks.endpoints.mockResolvedValue({ data: [endpoint({ enabled_events: ['invoice.paid'] }), endpoint()] })
    expect((await checkConnectReadiness()).ready).toBe(true)
  })

  it('does not report ready when Stripe cannot verify destination configuration', async () => {
    mocks.endpoints.mockRejectedValue(new Error('Stripe unavailable'))
    await expect(checkConnectReadiness()).rejects.toThrow('Stripe unavailable')
  })
})
