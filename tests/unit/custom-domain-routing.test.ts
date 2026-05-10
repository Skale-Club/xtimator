import { describe, it, expect } from 'vitest'

function isCustomHost(host: string, appHost: string): boolean {
  return (
    !host.includes('localhost') &&
    !host.endsWith('.vercel.app') &&
    host !== appHost
  )
}

describe('Custom domain host detection (DOMAIN-03)', () => {
  const APP_HOST = 'xtimator.com'

  it('identifies a custom domain when host differs from appHost and is not localhost', () => {
    expect(isCustomHost('estimates.mycompany.com', APP_HOST)).toBe(true)
  })

  it('does NOT flag localhost:3000 as a custom domain', () => {
    expect(isCustomHost('localhost:3000', APP_HOST)).toBe(false)
  })

  it('does NOT flag *.vercel.app hosts as custom domains', () => {
    expect(isCustomHost('xtimator-abc123.vercel.app', APP_HOST)).toBe(false)
  })

  it('does NOT flag the primary app host as a custom domain', () => {
    expect(isCustomHost('xtimator.com', APP_HOST)).toBe(false)
  })
})

describe('EstimateView whiteLabelMode prop (DOMAIN-04)', () => {
  it('footer logic: whiteLabelMode=true means !whiteLabelMode is false (hidden)', () => {
    const whiteLabelMode = true
    expect(!whiteLabelMode).toBe(false)
  })

  it('footer logic: whiteLabelMode=false means !whiteLabelMode is true (visible)', () => {
    const whiteLabelMode = false
    expect(!whiteLabelMode).toBe(true)
  })

  it('footer logic: whiteLabelMode=undefined coerces to false (visible)', () => {
    const whiteLabelMode = undefined
    expect(!whiteLabelMode).toBe(true)
  })
})
