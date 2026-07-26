import { afterEach, describe, expect, it, vi } from 'vitest'

const originalDemoOrigin = process.env.DEMO_APP_ORIGIN

async function loadConfig(demoOrigin: string | undefined) {
  vi.resetModules()
  if (demoOrigin === undefined) {
    delete process.env.DEMO_APP_ORIGIN
  } else {
    process.env.DEMO_APP_ORIGIN = demoOrigin
  }
  return import('@/lib/demo/config')
}

afterEach(() => {
  vi.resetModules()
  if (originalDemoOrigin === undefined) {
    delete process.env.DEMO_APP_ORIGIN
  } else {
    process.env.DEMO_APP_ORIGIN = originalDemoOrigin
  }
})

describe('ENTRY-04: getDemoAppOrigin', () => {
  it('accepts the configured localhost host and port without weakening production cookies', async () => {
    const { getDemoAppOrigin } = await loadConfig('http://demo.localhost:9633')

    const origin = getDemoAppOrigin()

    expect(origin?.href).toBe('http://demo.localhost:9633/')
    expect(origin?.protocol).toBe('http:')
    expect(origin?.host).toBe('demo.localhost:9633')
  })

  it('accepts the production HTTPS demo origin', async () => {
    const { getDemoAppOrigin } = await loadConfig('https://demo.xtimator.com')

    expect(getDemoAppOrigin()?.href).toBe('https://demo.xtimator.com/')
  })

  it.each([
    undefined,
    'https://demo.xtimator.com/demo/entry',
    'https://demo.xtimator.com/?next=https://evil.example',
    'https://demo.xtimator.com/#fragment',
    'https://demo:password@xtimator.com',
    'http://demo.xtimator.com',
    'ftp://demo.xtimator.com',
    'https://demo.xtimator.com.evil.example',
  ])('rejects an unsafe or malformed configured origin: %s', async (value) => {
    const { getDemoAppOrigin } = await loadConfig(value)

    expect(getDemoAppOrigin()).toBeNull()
  })

  it('keeps canonical demo credentials server-only', async () => {
    const { getDemoUserEmail, getDemoUserPassword } = await loadConfig('https://demo.xtimator.com')

    expect(getDemoUserEmail).toBeDefined()
    expect(getDemoUserPassword).toBeDefined()
    expect(getDemoUserPassword.toString()).not.toContain('NEXT_PUBLIC_')
  })
})
