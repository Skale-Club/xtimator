import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const signOut = vi.fn()
const redirect = vi.fn((destination: string) => {
  throw new Error(`NEXT_REDIRECT:${destination}`)
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { signOut } })),
}))
vi.mock('next/navigation', () => ({ redirect }))

const originalApexOrigin = process.env.DEMO_APEX_ORIGIN
const originalDemoOrigin = process.env.DEMO_APP_ORIGIN
const originalAppOrigin = process.env.APP_ORIGIN

async function loadAction(apexOrigin: string | undefined) {
  vi.resetModules()
  if (apexOrigin === undefined) {
    delete process.env.DEMO_APEX_ORIGIN
  } else {
    process.env.DEMO_APEX_ORIGIN = apexOrigin
  }
  process.env.DEMO_APP_ORIGIN = 'https://demo.xtimator.com'
  return import('@/lib/demo/actions')
}

beforeEach(() => {
  vi.clearAllMocks()
  signOut.mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.resetModules()
  for (const [key, value] of [
    ['DEMO_APEX_ORIGIN', originalApexOrigin],
    ['DEMO_APP_ORIGIN', originalDemoOrigin],
    ['APP_ORIGIN', originalAppOrigin],
  ] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('SAFE-02: local-only demo exit', () => {
  it('locally signs out only this browser session, then redirects to absolute apex signup', async () => {
    const { exitDemoToSignup } = await loadAction('https://xtimator.com')

    await expect(exitDemoToSignup()).rejects.toThrow(
      'NEXT_REDIRECT:https://xtimator.com/?auth=signup',
    )

    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
    expect(redirect).toHaveBeenCalledExactlyOnceWith(
      'https://xtimator.com/?auth=signup',
    )
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(
      redirect.mock.invocationCallOrder[0],
    )
  })

  it('supports the configured localhost apex without weakening the host boundary', async () => {
    process.env.DEMO_APP_ORIGIN = 'http://demo.localhost:9633'
    const { exitDemoToSignup } = await loadAction('http://localhost:9633')
    process.env.DEMO_APP_ORIGIN = 'http://demo.localhost:9633'

    await expect(exitDemoToSignup()).rejects.toThrow(
      'NEXT_REDIRECT:http://localhost:9633/?auth=signup',
    )
  })
})

describe('SAFE-02: apex redirect validation', () => {
  it.each([
    undefined,
    '/?auth=signup',
    'https://user:password@xtimator.com',
    'https://xtimator.com/?from=demo',
    'https://xtimator.com/demo',
    'https://xtimator.com/#signup',
    'https://demo.xtimator.com',
    'https://xtimator.com.evil.example',
    'http://xtimator.com',
  ])('rejects unsafe configured apex origin %s before any Auth effect', async (origin) => {
    const { exitDemoToSignup } = await loadAction(origin)

    await expect(exitDemoToSignup()).rejects.toThrow(/DEMO_APEX_ORIGIN/)

    expect(signOut).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('never falls back to APP_ORIGIN or request-header-derived authority', async () => {
    process.env.APP_ORIGIN = 'https://evil.example'
    const { exitDemoToSignup } = await loadAction(undefined)

    await expect(exitDemoToSignup()).rejects.toThrow(/DEMO_APEX_ORIGIN/)
    expect(redirect).not.toHaveBeenCalled()

    const source = readFileSync(resolve(process.cwd(), 'lib/demo/actions.ts'), 'utf8')
    expect(source).not.toMatch(/headers\s*\(|x-forwarded-host|process\.env\.APP_ORIGIN/)
  })
})
