import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getIntegrationKey = vi.hoisted(() => vi.fn())
vi.mock('@/lib/platform-config', () => ({ getIntegrationKey }))
import { getStripeClient } from '@/lib/billing/stripe-client'

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllEnvs())

describe('Stripe key and database environment boundary', () => {
  it('uses the same normalized data mode as the application', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('DATA_API_MODE', ' POSTGREST ')
    getIntegrationKey.mockResolvedValue('sk_live_fixture')
    expect(await getStripeClient()).toBeDefined()
    expect(getIntegrationKey).toHaveBeenCalledWith('stripe')
  })
  it('refuses development payments against the production data mode before key lookup', async () => {
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('DATA_API_MODE', 'postgrest')
    await expect(getStripeClient()).rejects.toThrow('production data require the production runtime')
    expect(getIntegrationKey).not.toHaveBeenCalled()
  })
  it.each(['sk_live_fixture', 'rk_live_fixture'])('refuses %s against development data', async (key) => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DATA_API_MODE', 'supabase')
    getIntegrationKey.mockResolvedValue(key)
    await expect(getStripeClient()).rejects.toThrow('Live Stripe access is disabled outside production')
  })

  it.each(['sk_test_fixture', 'rk_test_fixture'])('refuses %s against production data', async (key) => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DATA_API_MODE', 'postgrest')
    getIntegrationKey.mockResolvedValue(key)
    await expect(getStripeClient()).rejects.toThrow('sandbox Stripe key cannot fulfill purchases against production data')
  })

  it.each([
    ['test', 'supabase', 'sk_test_fixture', 'stripe_test'],
    ['production', 'supabase', 'sk_test_fixture', 'stripe_test'],
    ['production', 'postgrest', 'sk_live_fixture', 'stripe'],
  ])('constructs the client only for matching %s / %s configuration', async (mode, dataMode, key, provider) => {
    vi.stubEnv('NODE_ENV', mode)
    vi.stubEnv('DATA_API_MODE', dataMode)
    getIntegrationKey.mockResolvedValue(key)
    expect(await getStripeClient()).toBeDefined()
    expect(getIntegrationKey).toHaveBeenCalledOnce()
    expect(getIntegrationKey).toHaveBeenCalledWith(provider)
  })

  it('refuses absent integration credentials', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DATA_API_MODE', 'supabase')
    getIntegrationKey.mockResolvedValue(null)
    await expect(getStripeClient()).rejects.toThrow('Sandbox secret key not configured')
  })

  it('never substitutes a stored live key for a missing sandbox key', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DATA_API_MODE', 'supabase')
    getIntegrationKey.mockImplementation(async provider => provider === 'stripe' ? 'sk_live_fixture' : null)
    await expect(getStripeClient()).rejects.toThrow('Sandbox secret key not configured')
    expect(getIntegrationKey).toHaveBeenCalledOnce()
    expect(getIntegrationKey).toHaveBeenCalledWith('stripe_test')
  })

  it('never substitutes a stored sandbox key for missing production credentials', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DATA_API_MODE', 'postgrest')
    getIntegrationKey.mockImplementation(async provider => provider === 'stripe_test' ? 'sk_test_fixture' : null)
    await expect(getStripeClient()).rejects.toThrow('Live secret key not configured')
    expect(getIntegrationKey).toHaveBeenCalledOnce()
    expect(getIntegrationKey).toHaveBeenCalledWith('stripe')
  })
})
