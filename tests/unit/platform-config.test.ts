import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setTestEncryptionKey } from '../fixtures/test-encryption-key'

// Mock the service client module. The factory returns a vi.fn() that tests override
// per-case to produce the chained mock behaviour they need.
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}))

/**
 * Build a chainable Supabase mock. Each terminal call (.single() or .maybeSingle())
 * resolves to the given response.
 */
function makeClient(response: { data: unknown; error?: unknown }) {
  const terminal = vi.fn().mockResolvedValue(response)
  const chain: Record<string, unknown> = {
    single: terminal,
    maybeSingle: terminal,
  }
  chain.from = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  return chain
}

describe('lib/platform-config (ADMIN-05, R-04)', () => {
  beforeEach(async () => {
    setTestEncryptionKey()
    vi.resetModules()
    const serviceModule = await import('@/lib/supabase/service')
    ;(serviceModule.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReset()
  })

  afterEach(() => {
    delete process.env.APP_ENCRYPTION_KEY
    delete process.env.RESEND_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.OPENAI_API_KEY
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_API_KEY
    vi.restoreAllMocks()
  })

  it('getBranding() maps DB columns to camelCase Branding', async () => {
    const serviceModule = await import('@/lib/supabase/service')
    const mocked = serviceModule.createServiceClient as unknown as ReturnType<typeof vi.fn>
    const client = makeClient({
      data: {
        app_name: 'Xtimator',
        logo_url: null,
        primary_color: '#0D9488',
        email_from_name: 'Xtimator Team',
      },
      error: null,
    })
    mocked.mockReturnValue(client)

    const { getBranding } = await import('@/lib/platform-config')
    const result = await getBranding()
    expect(result).toMatchObject({
      appName: 'Xtimator',
      logoUrl: null,
      primaryColor: '#0D9488',
      emailFromName: 'Xtimator Team',
      siteTitle: null,
      metaDescription: null,
      ogImageUrl: null,
      canonicalBaseUrl: null,
      faviconUrl: null,
    })
    expect(result.landingContent).toBeDefined()
  })

  it('getBranding() cache hit: second call within TTL does NOT invoke the client', async () => {
    const serviceModule = await import('@/lib/supabase/service')
    const mocked = serviceModule.createServiceClient as unknown as ReturnType<typeof vi.fn>
    const client = makeClient({
      data: {
        app_name: 'Xtimator',
        logo_url: null,
        primary_color: null,
        email_from_name: null,
      },
      error: null,
    })
    mocked.mockReturnValueOnce(client)
    // Second call throws if factory is invoked again
    mocked.mockImplementationOnce(() => {
      throw new Error('createServiceClient should not be called on cache hit')
    })

    const { getBranding } = await import('@/lib/platform-config')
    await getBranding()
    await expect(getBranding()).resolves.toMatchObject({ appName: 'Xtimator' })
    // Only the first mockReturnValueOnce was consumed — confirm by checking call count
    expect(mocked).toHaveBeenCalledTimes(1)
  })

  it('invalidatePlatformConfig() forces re-fetch on next getBranding() call', async () => {
    const serviceModule = await import('@/lib/supabase/service')
    const mocked = serviceModule.createServiceClient as unknown as ReturnType<typeof vi.fn>
    const client = makeClient({
      data: { app_name: 'A', logo_url: null, primary_color: null, email_from_name: null },
      error: null,
    })
    mocked.mockReturnValue(client)

    const { getBranding, invalidatePlatformConfig } = await import('@/lib/platform-config')
    await getBranding()
    expect(mocked).toHaveBeenCalledTimes(1)

    invalidatePlatformConfig()
    await getBranding()
    expect(mocked).toHaveBeenCalledTimes(2)
  })

  it('getBranding() returns non-null fallback when DB row is missing (R-04)', async () => {
    const serviceModule = await import('@/lib/supabase/service')
    const mocked = serviceModule.createServiceClient as unknown as ReturnType<typeof vi.fn>
    const client = makeClient({ data: null, error: { message: 'Row not found' } })
    mocked.mockReturnValue(client)

    const { getBranding } = await import('@/lib/platform-config')
    const result = await getBranding()
    expect(result).toMatchObject({
      appName: 'Xtimator',
      logoUrl: null,
      primaryColor: null,
      emailFromName: null,
      siteTitle: null,
      metaDescription: null,
      ogImageUrl: null,
      canonicalBaseUrl: null,
      faviconUrl: null,
    })
    expect(result.landingContent).toBeDefined()
  })

  it('getIntegrationKey(provider) decrypts DB ciphertext to plaintext', async () => {
    // Use the real crypto module with the test key to produce a valid blob.
    const { encrypt } = await import('@/lib/crypto/aes')
    const blob = encrypt('sk-test-123')

    const serviceModule = await import('@/lib/supabase/service')
    const mocked = serviceModule.createServiceClient as unknown as ReturnType<typeof vi.fn>
    const client = makeClient({
      data: { ciphertext: blob.ciphertext, iv: blob.iv, auth_tag: blob.authTag },
    })
    mocked.mockReturnValue(client)

    const { getIntegrationKey } = await import('@/lib/platform-config')
    const result = await getIntegrationKey('resend')
    expect(result).toBe('sk-test-123')
  })

  it('getIntegrationKey() falls back to env var when DB row missing AND warns', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-fallback'
    const serviceModule = await import('@/lib/supabase/service')
    const mocked = serviceModule.createServiceClient as unknown as ReturnType<typeof vi.fn>
    const client = makeClient({ data: null })
    mocked.mockReturnValue(client)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { getIntegrationKey } = await import('@/lib/platform-config')
    const result = await getIntegrationKey('anthropic')

    expect(result).toBe('env-fallback')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('Falling back')
  })

  it('getIntegrationKey() returns null when DB row missing AND env var unset', async () => {
    const serviceModule = await import('@/lib/supabase/service')
    const mocked = serviceModule.createServiceClient as unknown as ReturnType<typeof vi.fn>
    const client = makeClient({ data: null })
    mocked.mockReturnValue(client)

    const { getIntegrationKey } = await import('@/lib/platform-config')
    const result = await getIntegrationKey('openai')
    expect(result).toBeNull()
  })

  it("getIntegrationKey('stripe') prefers STRIPE_SECRET_KEY over STRIPE_API_KEY", async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_secret_pref'
    process.env.STRIPE_API_KEY = 'sk_api_old'

    const serviceModule = await import('@/lib/supabase/service')
    const mocked = serviceModule.createServiceClient as unknown as ReturnType<typeof vi.fn>
    const client = makeClient({ data: null })
    mocked.mockReturnValue(client)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { getIntegrationKey } = await import('@/lib/platform-config')
    const result = await getIntegrationKey('stripe')

    expect(result).toBe('sk_secret_pref')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('STRIPE_SECRET_KEY')
  })

  it("getIntegrationKey('stripe') falls back to STRIPE_API_KEY for back-compat", async () => {
    // STRIPE_SECRET_KEY intentionally unset — only the legacy var is present.
    process.env.STRIPE_API_KEY = 'sk_api_old'

    const serviceModule = await import('@/lib/supabase/service')
    const mocked = serviceModule.createServiceClient as unknown as ReturnType<typeof vi.fn>
    const client = makeClient({ data: null })
    mocked.mockReturnValue(client)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { getIntegrationKey } = await import('@/lib/platform-config')
    const result = await getIntegrationKey('stripe')

    expect(result).toBe('sk_api_old')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('STRIPE_API_KEY')
  })

  it('getIntegrationKey() leaves non-stripe providers on {PROVIDER}_API_KEY (regression)', async () => {
    process.env.OPENAI_API_KEY = 'env-openai'

    const serviceModule = await import('@/lib/supabase/service')
    const mocked = serviceModule.createServiceClient as unknown as ReturnType<typeof vi.fn>
    const client = makeClient({ data: null })
    mocked.mockReturnValue(client)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { getIntegrationKey } = await import('@/lib/platform-config')
    const result = await getIntegrationKey('openai')

    expect(result).toBe('env-openai')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('OPENAI_API_KEY')
  })

  it('getIntegrationKey() caches: two calls return same value with ONE DB round-trip', async () => {
    const { encrypt } = await import('@/lib/crypto/aes')
    const blob = encrypt('sk-resend-abc')

    const serviceModule = await import('@/lib/supabase/service')
    const mocked = serviceModule.createServiceClient as unknown as ReturnType<typeof vi.fn>
    const client = makeClient({
      data: { ciphertext: blob.ciphertext, iv: blob.iv, auth_tag: blob.authTag },
    })
    mocked.mockReturnValue(client)

    const { getIntegrationKey } = await import('@/lib/platform-config')
    const a = await getIntegrationKey('resend')
    const b = await getIntegrationKey('resend')
    expect(a).toBe('sk-resend-abc')
    expect(b).toBe('sk-resend-abc')
    expect(mocked).toHaveBeenCalledTimes(1)
  })
})
