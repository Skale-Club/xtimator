import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Pre-launch audit fix — lib/observability/env-check.ts boot-time validation.
 *
 * Contract:
 *   - No-op outside production (dev/test envs are allowed to be incomplete).
 *   - In production, missing a CRITICAL var (or an entire critical group —
 *     e.g. neither publishable nor anon key set) throws, crashing boot loudly
 *     rather than cascading into "supabaseUrl is required" on the first request.
 *   - In production, missing an IMPORTANT var logs via console.error but does
 *     NOT throw — those features degrade gracefully today (Stripe 503s,
 *     Redis fails open) and a crash here would be worse than the status quo.
 */

const ALL_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'APP_ORIGIN',
  'NEXT_PUBLIC_SITE_URL',
  'OPENROUTER_API_KEY',
  'INNGEST_SIGNING_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'STRIPE_WEBHOOK_SECRET',
  'APP_ENCRYPTION_KEY',
]

function fullyConfiguredEnv(): Record<string, string> {
  return Object.fromEntries(ALL_VARS.map((k) => [k, 'set']))
}

describe('validateProductionEnv', () => {
  const savedEnv: Record<string, string | undefined> = {}
  const savedNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.resetModules()
    for (const k of ALL_VARS) savedEnv[k] = process.env[k]
  })

  afterEach(() => {
    for (const k of ALL_VARS) {
      if (savedEnv[k] === undefined) delete process.env[k]
      else process.env[k] = savedEnv[k]
    }
    vi.stubEnv('NODE_ENV', savedNodeEnv ?? 'test')
    vi.unstubAllEnvs()
  })

  it('is a no-op outside production, even with everything missing', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    for (const k of ALL_VARS) delete process.env[k]

    const { validateProductionEnv } = await import('@/lib/observability/env-check')
    expect(() => validateProductionEnv()).not.toThrow()
  })

  it('does not throw or warn in production when everything is set', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    Object.assign(process.env, fullyConfiguredEnv())
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { validateProductionEnv } = await import('@/lib/observability/env-check')
    expect(() => validateProductionEnv()).not.toThrow()
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('throws in production when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    Object.assign(process.env, fullyConfiguredEnv())
    Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_SUPABASE_URL')

    const { validateProductionEnv } = await import('@/lib/observability/env-check')
    expect(() => validateProductionEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('throws in production when NEITHER publishable nor anon key is set', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    Object.assign(process.env, fullyConfiguredEnv())
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY')

    const { validateProductionEnv } = await import('@/lib/observability/env-check')
    expect(() => validateProductionEnv()).toThrow()
  })

  it('does NOT throw when only the anon key (not publishable) is set — group check passes', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    Object.assign(process.env, fullyConfiguredEnv())
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    const { validateProductionEnv } = await import('@/lib/observability/env-check')
    expect(() => validateProductionEnv()).not.toThrow()
  })

  it('throws in production when NEITHER APP_ORIGIN nor NEXT_PUBLIC_SITE_URL is set', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    Object.assign(process.env, fullyConfiguredEnv())
    delete process.env.APP_ORIGIN
    delete process.env.NEXT_PUBLIC_SITE_URL

    const { validateProductionEnv } = await import('@/lib/observability/env-check')
    expect(() => validateProductionEnv()).toThrow()
  })

  it('does NOT throw when only NEXT_PUBLIC_SITE_URL (not APP_ORIGIN) is set — group check passes', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    Object.assign(process.env, fullyConfiguredEnv())
    delete process.env.APP_ORIGIN

    const { validateProductionEnv } = await import('@/lib/observability/env-check')
    expect(() => validateProductionEnv()).not.toThrow()
  })

  it('warns via console.error but does NOT throw when STRIPE_WEBHOOK_SECRET is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    Object.assign(process.env, fullyConfiguredEnv())
    delete process.env.STRIPE_WEBHOOK_SECRET
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { validateProductionEnv } = await import('@/lib/observability/env-check')
    expect(() => validateProductionEnv()).not.toThrow()
    expect(errorSpy).toHaveBeenCalledOnce()
    expect(errorSpy.mock.calls[0][0]).toMatch(/STRIPE_WEBHOOK_SECRET/)
    errorSpy.mockRestore()
  })

  it('warns via console.error but does NOT throw when APP_ENCRYPTION_KEY is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    Object.assign(process.env, fullyConfiguredEnv())
    delete process.env.APP_ENCRYPTION_KEY
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { validateProductionEnv } = await import('@/lib/observability/env-check')
    expect(() => validateProductionEnv()).not.toThrow()
    expect(errorSpy).toHaveBeenCalledOnce()
    expect(errorSpy.mock.calls[0][0]).toMatch(/APP_ENCRYPTION_KEY/)
    errorSpy.mockRestore()
  })

  it('warns via console.error but does NOT throw when an IMPORTANT var (e.g. UPSTASH_*) is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    Object.assign(process.env, fullyConfiguredEnv())
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { validateProductionEnv } = await import('@/lib/observability/env-check')
    expect(() => validateProductionEnv()).not.toThrow()
    expect(errorSpy).toHaveBeenCalledOnce()
    expect(errorSpy.mock.calls[0][0]).toMatch(/UPSTASH_REDIS_REST_URL/)
    errorSpy.mockRestore()
  })
})
