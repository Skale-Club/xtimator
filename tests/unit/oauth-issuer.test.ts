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
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_URL: process.env.VERCEL_URL,
    }
    delete process.env.APP_ORIGIN
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.VERCEL_ENV
    delete process.env.VERCEL_URL
    vi.resetModules()
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('1. NEXT_PUBLIC_APP_URL wins when set (overrides everything)', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://custom.example.com'
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_URL = 'preview-abc.vercel.app'
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('https://custom.example.com')
  })

  it('1a. NEXT_PUBLIC_APP_URL trailing slash is stripped', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://custom.example.com/'
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('https://custom.example.com')
  })

  it('1b. NEXT_PUBLIC_APP_URL trailing whitespace (e.g. trailing newline from echo|vercel env add) is trimmed', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://custom.example.com\n'
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('https://custom.example.com')
  })

  it('1c. whitespace-only NEXT_PUBLIC_APP_URL falls through to next branch', async () => {
    process.env.NEXT_PUBLIC_APP_URL = '   \n  '
    process.env.VERCEL_ENV = 'production'
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('https://xtimator.com')
  })

  it('1d. APP_ORIGIN (runtime) wins over NEXT_PUBLIC_APP_URL and NEXT_PUBLIC_SITE_URL', async () => {
    process.env.APP_ORIGIN = 'https://xtimator.com'
    process.env.NEXT_PUBLIC_APP_URL = 'https://legacy.example.com'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.com'
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_URL = 'preview-abc.vercel.app'
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('https://xtimator.com')
  })

  it('1e. NEXT_PUBLIC_SITE_URL used when APP_ORIGIN and NEXT_PUBLIC_APP_URL unset', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.com'
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('https://site.example.com')
  })

  it('2. VERCEL_ENV=production resolves to canonical https://xtimator.com (not the preview URL)', async () => {
    // This is the bug being fixed by the 2026-05-26 hotfix: without this branch,
    // production deployments emit the per-deploy preview URL as the OAuth issuer,
    // which breaks Claude.ai's discovery cache the moment a new deploy lands.
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_URL = 'xtimator-10grdklhm-skaleclub.vercel.app'
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('https://xtimator.com')
  })

  it('3. VERCEL_URL is used for non-production deployments (preview)', async () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.VERCEL_URL = 'xtimator-pr123.vercel.app'
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('https://xtimator-pr123.vercel.app')
  })

  it('4. localhost dev falls back to request origin', async () => {
    // Default mock returns host: localhost:9633
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    expect(await resolveIssuer()).toBe('http://localhost:9633')
  })

  it('regression: production deploy never returns *.vercel.app URL even when VERCEL_URL is set', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_URL = 'xtimator-abcdef-skaleclub.vercel.app'
    const { resolveIssuer } = await import('@/lib/oauth/issuer')
    const issuer = await resolveIssuer()
    expect(issuer).not.toMatch(/vercel\.app/i)
    expect(issuer).toBe('https://xtimator.com')
  })
})
