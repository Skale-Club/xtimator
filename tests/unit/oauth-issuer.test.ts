import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map([['host', 'localhost:9633']])),
}))

describe('resolveIssuer — canonical URL priority', () => {
  let envBackup: Record<string, string | undefined>

  beforeEach(() => {
    envBackup = {
      APP_ORIGIN: process.env.APP_ORIGIN,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      NODE_ENV: process.env.NODE_ENV,
    }
    delete process.env.APP_ORIGIN
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXT_PUBLIC_SITE_URL
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('1. NEXT_PUBLIC_APP_URL wins when set (overrides everything)', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://custom.example.com'
    vi.stubEnv('NODE_ENV', 'production')
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('https://custom.example.com')
  })

  it('1a. NEXT_PUBLIC_APP_URL trailing slash is stripped', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://custom.example.com/'
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('https://custom.example.com')
  })

  it('1b. NEXT_PUBLIC_APP_URL trailing whitespace (e.g. trailing newline from echo|env add) is trimmed', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://custom.example.com\n'
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('https://custom.example.com')
  })

  it('1c. whitespace-only NEXT_PUBLIC_APP_URL falls through to next branch', async () => {
    process.env.NEXT_PUBLIC_APP_URL = '   \n  '
    vi.stubEnv('NODE_ENV', 'production')
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('https://xtimator.com')
  })

  it('1d. APP_ORIGIN (runtime) wins over NEXT_PUBLIC_APP_URL and NEXT_PUBLIC_SITE_URL', async () => {
    process.env.APP_ORIGIN = 'https://xtimator.com'
    process.env.NEXT_PUBLIC_APP_URL = 'https://legacy.example.com'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.com'
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('https://xtimator.com')
  })

  it('1e. NEXT_PUBLIC_SITE_URL used when APP_ORIGIN and NEXT_PUBLIC_APP_URL unset', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.com'
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('https://site.example.com')
  })

  it('2. NODE_ENV=production resolves to canonical https://xtimator.com when no explicit env is set', async () => {
    // Safety net: production must always emit the canonical domain, never a
    // per-deploy or request-derived URL, so OAuth issuer / .well-known metadata
    // is stable across deploys.
    vi.stubEnv('NODE_ENV', 'production')
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('https://xtimator.com')
  })

  it('4. localhost dev falls back to request origin', async () => {
    // Default mock returns host: localhost:9633; NODE_ENV is 'test' under vitest.
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('http://localhost:9633')
  })

  it('regression: production never returns a spoofed request Host header as the issuer', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { headers } = await import('next/headers')
    vi.mocked(headers).mockResolvedValueOnce(
      new Map([['host', 'evil.example.com']]) as unknown as Awaited<ReturnType<typeof headers>>
    )
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    const issuer = await resolveIssuer()
    expect(issuer).not.toMatch(/evil\.example\.com/i)
    expect(issuer).toBe('https://xtimator.com')
  })
})
