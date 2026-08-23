import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * WP-L extra fix (2) — resolveTierFromPriceId prefers the Price's
 * metadata.kind tag (stamped by stripe-subscription-prices.ts, survives an
 * admin price change that archives the old Price and mints a new one) over
 * the current billing_config/env id list, which goes stale the moment a price
 * changes.
 */

const mockGetBillingConfig = vi.fn()
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: (...args: unknown[]) => mockGetBillingConfig(...args),
}))

const { resolveTierFromPriceId } = await import('@/lib/billing/stripe-price-map')

const CONFIG = {
  tiers: {
    pro: { stripePriceIdMonth: 'price_pro_current', stripePriceIdYear: 'price_pro_current_year' },
    business: { stripePriceIdMonth: 'price_biz_current', stripePriceIdYear: 'price_biz_current_year' },
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBillingConfig.mockResolvedValue(CONFIG)
})

describe('resolveTierFromPriceId', () => {
  it('returns null for a null/undefined price', async () => {
    expect(await resolveTierFromPriceId(null)).toBeNull()
    expect(await resolveTierFromPriceId(undefined)).toBeNull()
  })

  it('resolves via the CURRENT billing_config id (fast path) for a bare id string', async () => {
    expect(await resolveTierFromPriceId('price_pro_current')).toBe('pro')
    expect(await resolveTierFromPriceId('price_biz_current_year')).toBe('business')
  })

  it('resolves via metadata.kind for an EXPANDED Price object whose id is NOT in the current config (archived price)', async () => {
    const archivedPrice = { id: 'price_archived_old', metadata: { kind: 'subscription_pro', term: 'month' } }
    expect(await resolveTierFromPriceId(archivedPrice)).toBe('pro')
  })

  it('metadata.kind wins even when it happens to differ from what the id list would say', async () => {
    // Pathological but proves ordering: metadata is checked FIRST.
    const price = { id: 'price_pro_current', metadata: { kind: 'subscription_business' } }
    expect(await resolveTierFromPriceId(price)).toBe('business')
  })

  it('falls back to the id list when the expanded object carries no metadata.kind', async () => {
    const price = { id: 'price_biz_current', metadata: {} }
    expect(await resolveTierFromPriceId(price)).toBe('business')
  })

  it('returns null for a Price with an unrecognized id and no usable metadata', async () => {
    const price = { id: 'price_totally_unknown', metadata: {} }
    expect(await resolveTierFromPriceId(price)).toBeNull()
  })

  it('retrieves the Price via the supplied stripe client when only a bare id is given and the id list misses', async () => {
    const mockRetrieve = vi.fn().mockResolvedValue({ metadata: { kind: 'subscription_business' } })
    const stripe = { prices: { retrieve: mockRetrieve } } as never

    const result = await resolveTierFromPriceId('price_archived_bare_id', stripe)

    expect(mockRetrieve).toHaveBeenCalledWith('price_archived_bare_id')
    expect(result).toBe('business')
  })

  it('never throws when the retrieve fails — falls through to null', async () => {
    const mockRetrieve = vi.fn().mockRejectedValue(new Error('No such price'))
    const stripe = { prices: { retrieve: mockRetrieve } } as never

    const result = await resolveTierFromPriceId('price_gone', stripe)

    expect(result).toBeNull()
  })

  it('never calls stripe.prices.retrieve for an already-expanded object (no network round-trip needed)', async () => {
    const mockRetrieve = vi.fn()
    const stripe = { prices: { retrieve: mockRetrieve } } as never

    await resolveTierFromPriceId({ id: 'price_pro_current', metadata: {} }, stripe)

    expect(mockRetrieve).not.toHaveBeenCalled()
  })

  it('degrades to the env-var fallback when getBillingConfig throws', async () => {
    mockGetBillingConfig.mockRejectedValue(new Error('config unavailable'))
    vi.stubEnv('STRIPE_PRICE_PRO', 'price_env_pro')

    expect(await resolveTierFromPriceId('price_env_pro')).toBe('pro')
  })
})
