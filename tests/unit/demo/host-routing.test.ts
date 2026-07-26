import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const originalDemoOrigin = process.env.DEMO_APP_ORIGIN

async function loadSession(demoOrigin = 'https://demo.xtimator.com') {
  vi.resetModules()
  process.env.DEMO_APP_ORIGIN = demoOrigin
  return import('@/lib/demo/session')
}

afterEach(() => {
  vi.resetModules()
  if (originalDemoOrigin === undefined) {
    delete process.env.DEMO_APP_ORIGIN
  } else {
    process.env.DEMO_APP_ORIGIN = originalDemoOrigin
  }
})

describe('demo entry host routing', () => {
  it('routes only the apex entry to the fixed demo-host entry', async () => {
    const { classifyDemoEntryRequest } = await loadSession()

    expect(classifyDemoEntryRequest(new NextRequest('https://xtimator.com/demo/entry'))).toEqual({
      kind: 'apex',
      destination: 'https://demo.xtimator.com/demo/entry',
    })
  })

  it.each([
    'https://demo.xtimator.com/demo/entry',
    'http://demo.localhost:9633/demo/entry',
  ])('recognizes the exact configured demo host: %s', async (url) => {
    const demoOrigin = new URL(url).origin
    const { classifyDemoEntryRequest } = await loadSession(demoOrigin)

    expect(classifyDemoEntryRequest(new NextRequest(url))).toEqual({ kind: 'demo-host' })
  })

  it.each([
    'https://demo.xtimator.com.evil.example/demo/entry',
    'http://demo.xtimator.com/demo/entry',
    'https://demo.xtimator.com:444/demo/entry',
    'https://www.xtimator.com/demo/entry',
    'https://xtimator.com/demo/entry?next=https://evil.example',
  ])('does not trust hostile request metadata or a supplied destination: %s', async (url) => {
    const { classifyDemoEntryRequest } = await loadSession()
    const request = new NextRequest(url, {
      headers: {
        host: 'evil.example',
        'x-forwarded-host': 'evil.example',
      },
    })

    expect(classifyDemoEntryRequest(request)).toEqual({ kind: 'reject' })
  })

  it('keeps legacy /demo outside the additive entry contract', async () => {
    const { classifyDemoEntryRequest } = await loadSession()

    expect(classifyDemoEntryRequest(new NextRequest('https://xtimator.com/demo'))).toEqual({
      kind: 'reject',
    })
  })
})
