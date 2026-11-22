import { describe, it, expect } from 'vitest'

const { filterPlanBullets, CUSTOM_DOMAIN_ENABLED } = await import('@/lib/billing/plan-bullets')
const { DEFAULT_BILLING_CONFIG } = await import('@/lib/billing/billing-config')

// A stored billing_config can still carry the old bullets: the filter is the guard.
const STORED = ['Everything in Pro', 'Custom domain', 'Stripe Connect payments', 'Phone + chat support']

describe('filterPlanBullets', () => {
  it('custom domain is off at launch', () => {
    expect(CUSTOM_DOMAIN_ENABLED).toBe(false)
  })

  it('never shows Custom domain, even when the stored config lists it', () => {
    expect(filterPlanBullets(STORED)).not.toContain('Custom domain')
    expect(filterPlanBullets(['custom DOMAIN with SSL'])).toEqual([])
  })

  it('never shows a payments bullet: payments are switched per company, not sold by plan', () => {
    expect(filterPlanBullets(STORED)).toEqual(['Everything in Pro', 'Phone + chat support'])
    expect(filterPlanBullets(['Online payments'])).toEqual([])
  })

  it('code defaults no longer list either bullet', () => {
    const all = Object.values(DEFAULT_BILLING_CONFIG.tiers).flatMap((t) => t.featureBullets).join('|')
    expect(all).not.toMatch(/custom domain/i)
    expect(all).not.toMatch(/stripe connect/i)
  })
})
