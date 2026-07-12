import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'

/**
 * v4.18 — panel-managed subscription Prices. Locks the contract of
 * lib/billing/stripe-subscription-prices.ts:
 *   - syncTierPrice is idempotent when the amount/interval/active state is
 *     unchanged (returns the SAME id, creates NO new Price).
 *   - syncTierPrice creates a new Price AND best-effort archives the old one
 *     when the amount changes.
 *   - syncTierPrice returns null (and touches nothing) for amount <= 0.
 *   - syncAllTierPrices is a NO-OP that returns the EXISTING ids when
 *     getStripeClient throws (Stripe unconfigured) — saving must never fail.
 */

// getStripeClient is the only external dependency; mock it so syncAllTierPrices
// can be driven into both the configured and the unconfigured (throw) paths.
const getStripeClientMock = vi.fn()
vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: () => getStripeClientMock(),
}))

const { syncTierPrice, syncAllTierPrices } = await import(
  '@/lib/billing/stripe-subscription-prices'
)

// ---- fake Stripe SDK boundary ----------------------------------------------
function makeStripe(overrides: {
  retrieve?: ReturnType<typeof vi.fn>
  create?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
  productsSearch?: ReturnType<typeof vi.fn>
  productsCreate?: ReturnType<typeof vi.fn>
} = {}) {
  const productsSearch =
    overrides.productsSearch ?? vi.fn().mockResolvedValue({ data: [{ id: 'prod_existing' }] })
  const productsCreate =
    overrides.productsCreate ?? vi.fn().mockResolvedValue({ id: 'prod_new' })
  const pricesRetrieve = overrides.retrieve ?? vi.fn()
  const pricesCreate =
    overrides.create ?? vi.fn().mockResolvedValue({ id: 'price_new' })
  const pricesUpdate = overrides.update ?? vi.fn().mockResolvedValue({})
  const stripe = {
    products: { search: productsSearch, create: productsCreate },
    prices: { retrieve: pricesRetrieve, create: pricesCreate, update: pricesUpdate },
  }
  return { stripe: stripe as unknown as Stripe, productsSearch, productsCreate, pricesRetrieve, pricesCreate, pricesUpdate }
}

beforeEach(() => {
  getStripeClientMock.mockReset()
})

describe('syncTierPrice', () => {
  it('returns null and touches nothing for amount <= 0', async () => {
    const { stripe, pricesRetrieve, pricesCreate } = makeStripe()

    expect(await syncTierPrice(stripe, 'pro', 'month', 0, null)).toBeNull()
    expect(await syncTierPrice(stripe, 'pro', 'month', -100, 'price_x')).toBeNull()
    expect(pricesRetrieve).not.toHaveBeenCalled()
    expect(pricesCreate).not.toHaveBeenCalled()
  })

  it('is idempotent: returns the same id and creates NO Price when nothing changed', async () => {
    const retrieve = vi.fn().mockResolvedValue({
      active: true,
      unit_amount: 2900,
      recurring: { interval: 'month' },
    })
    const { stripe, pricesCreate, pricesUpdate, productsSearch } = makeStripe({ retrieve })

    const result = await syncTierPrice(stripe, 'pro', 'month', 2900, 'price_current')

    expect(result).toBe('price_current')
    expect(retrieve).toHaveBeenCalledWith('price_current')
    expect(pricesCreate).not.toHaveBeenCalled()
    expect(pricesUpdate).not.toHaveBeenCalled()
    expect(productsSearch).not.toHaveBeenCalled()
  })

  it('creates a new Price and archives the old one when the amount changes', async () => {
    const retrieve = vi.fn().mockResolvedValue({
      active: true,
      unit_amount: 2900,
      recurring: { interval: 'month' },
    })
    const create = vi.fn().mockResolvedValue({ id: 'price_brand_new' })
    const update = vi.fn().mockResolvedValue({})
    const { stripe, pricesCreate, pricesUpdate } = makeStripe({ retrieve, create, update })

    const result = await syncTierPrice(stripe, 'pro', 'month', 3900, 'price_old')

    expect(result).toBe('price_brand_new')
    expect(pricesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'usd',
        unit_amount: 3900,
        recurring: { interval: 'month' },
        product: 'prod_existing',
        metadata: { kind: 'subscription_pro', term: 'month' },
      })
    )
    // Old Price archived best-effort.
    expect(pricesUpdate).toHaveBeenCalledWith('price_old', { active: false })
  })

  it('creates a new Price when there is no current id (first provisioning)', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'price_first' })
    const { stripe, pricesRetrieve, pricesUpdate } = makeStripe({ create })

    const result = await syncTierPrice(stripe, 'business', 'year', 99000, null)

    expect(result).toBe('price_first')
    // No current id → never retrieved, never archived.
    expect(pricesRetrieve).not.toHaveBeenCalled()
    expect(pricesUpdate).not.toHaveBeenCalled()
  })

  it('never throws when archiving the old Price fails', async () => {
    const retrieve = vi.fn().mockResolvedValue({
      active: true,
      unit_amount: 2900,
      recurring: { interval: 'month' },
    })
    const create = vi.fn().mockResolvedValue({ id: 'price_new_ok' })
    const update = vi.fn().mockRejectedValue(new Error('cannot archive'))
    const { stripe } = makeStripe({ retrieve, create, update })

    await expect(syncTierPrice(stripe, 'pro', 'month', 3900, 'price_old')).resolves.toBe(
      'price_new_ok'
    )
  })
})

describe('syncAllTierPrices', () => {
  const cfg = {
    tiers: {
      pro: {
        subscriptionPriceCents: 2900,
        subscriptionPriceAnnualCents: 29000,
        stripePriceIdMonth: 'price_pro_m',
        stripePriceIdYear: 'price_pro_y',
      },
      business: {
        subscriptionPriceCents: 9900,
        subscriptionPriceAnnualCents: 99000,
        stripePriceIdMonth: 'price_biz_m',
        stripePriceIdYear: 'price_biz_y',
      },
    },
  } as never

  it('no-ops and returns the EXISTING ids unchanged when getStripeClient throws', async () => {
    getStripeClientMock.mockRejectedValue(new Error('Stripe not configured'))

    const result = await syncAllTierPrices(cfg)

    expect(result).toEqual({
      pro: { month: 'price_pro_m', year: 'price_pro_y' },
      business: { month: 'price_biz_m', year: 'price_biz_y' },
    })
  })

  it('returns the reconciled id map when Stripe is configured', async () => {
    // Every stored id still matches its amount → idempotent, ids returned as-is.
    const retrieve = vi.fn().mockImplementation(async (id: string) => {
      const amounts: Record<string, number> = {
        price_pro_m: 2900,
        price_pro_y: 29000,
        price_biz_m: 9900,
        price_biz_y: 99000,
      }
      return { active: true, unit_amount: amounts[id], recurring: { interval: id.endsWith('_y') ? 'year' : 'month' } }
    })
    const { stripe } = makeStripe({ retrieve })
    getStripeClientMock.mockResolvedValue(stripe)

    const result = await syncAllTierPrices(cfg)

    expect(result).toEqual({
      pro: { month: 'price_pro_m', year: 'price_pro_y' },
      business: { month: 'price_biz_m', year: 'price_biz_y' },
    })
  })
})
