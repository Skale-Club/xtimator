import { describe, it, expect, vi } from 'vitest'

const connectOpen = vi.hoisted(() => ({ value: false }))
vi.mock('@/lib/billing/connect-availability', () => ({
  isConnectOnboardingOpen: () => connectOpen.value,
}))

const { filterPlanBullets, CUSTOM_DOMAIN_ENABLED } = await import('@/lib/billing/plan-bullets')
const { DEFAULT_BILLING_CONFIG } = await import('@/lib/billing/billing-config')

// A stored billing_config can still carry the old bullets: the filter is the guard.
const STORED = ['Everything in Pro', 'Custom domain', 'Stripe Connect payments', 'Phone + chat support']

describe('filterPlanBullets', () => {
  it('custom domain is off at launch', () => {
    expect(CUSTOM_DOMAIN_ENABLED).toBe(false)
  })

  it('never shows Custom domain, even when the stored config lists it', () => {
    connectOpen.value = true
    expect(filterPlanBullets(STORED)).not.toContain('Custom domain')
    expect(filterPlanBullets(['custom DOMAIN with SSL'])).toEqual([])
  })

  it('hides the Stripe Connect bullet while Connect is closed', () => {
    connectOpen.value = false
    expect(filterPlanBullets(STORED)).toEqual(['Everything in Pro', 'Phone + chat support'])
  })

  it('shows the Stripe Connect bullet once Connect is open', () => {
    connectOpen.value = true
    expect(filterPlanBullets(STORED)).toEqual([
      'Everything in Pro',
      'Stripe Connect payments',
      'Phone + chat support',
    ])
  })

  it('code defaults no longer list either bullet', () => {
    const all = Object.values(DEFAULT_BILLING_CONFIG.tiers).flatMap((t) => t.featureBullets).join('|')
    expect(all).not.toMatch(/custom domain/i)
    expect(all).not.toMatch(/stripe connect/i)
  })
})
