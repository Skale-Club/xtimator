import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'

/**
 * v4.18 — panel-managed subscription Prices. Locks the contract of
 * lib/billing/stripe-subscription-prices.ts:
 *   - syncTierPrice is idempotent when the amount/interval/active state is
 *     unchanged (returns the SAME id, creates NO new Price).
 *   - syncTierPrice creates a new Price and returns the superseded old id via
 *     `supersededPriceId` WITHOUT archiving it (archiving is the caller's job,
 *     via `archivePrices`, only after the caller's own persistence succeeds —
 *     see the ARCHIVE ORDERING note in the module).
 *   - syncTierPrice returns { priceId: null, supersededPriceId: null } (and
 *     touches nothing) for amount <= 0.
 *   - syncAllTierPrices is a NO-OP that returns the EXISTING ids (with an
 *     empty supersededPriceIds) when getStripeClient throws (Stripe
 *     unconfigured) — saving must never fail.
 *   - archivePrices best-effort archives a list of Price ids, never throwing
 *     even when an individual archive call fails.
 */

// getStripeClient is the only external dependency; mock it so syncAllTierPrices
// can be driven into both the configured and the unconfigured (throw) paths.
const getStripeClientMock = vi.fn()
vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: () => getStripeClientMock(),
}))

const { syncTierPrice, syncAllTierPrices, archivePrices } = await import(
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
  it('returns { priceId: null, supersededPriceId: null } and touches nothing for amount <= 0', async () => {
    const { stripe, pricesRetrieve, pricesCreate } = makeStripe()

    expect(await syncTierPrice(stripe, 'pro', 'month', 0, null)).toEqual({
      priceId: null,
      supersededPriceId: null,
    })
    expect(await syncTierPrice(stripe, 'pro', 'month', -100, 'price_x')).toEqual({
      priceId: null,
      supersededPriceId: null,
    })
    expect(pricesRetrieve).not.toHaveBeenCalled()
    expect(pricesCreate).not.toHaveBeenCalled()
  })

  it('is idempotent: returns the same id (no superseded id) and creates NO Price when nothing changed', async () => {
    const retrieve = vi.fn().mockResolvedValue({
      active: true,
      unit_amount: 2900,
      recurring: { interval: 'month' },
    })
    const { stripe, pricesCreate, pricesUpdate, productsSearch } = makeStripe({ retrieve })

    const result = await syncTierPrice(stripe, 'pro', 'month', 2900, 'price_current')

    expect(result).toEqual({ priceId: 'price_current', supersededPriceId: null })
    expect(retrieve).toHaveBeenCalledWith('price_current')
    expect(pricesCreate).not.toHaveBeenCalled()
    expect(pricesUpdate).not.toHaveBeenCalled()
    expect(productsSearch).not.toHaveBeenCalled()
  })

  it('creates a new Price and returns the old id as supersededPriceId WITHOUT archiving it', async () => {
    const retrieve = vi.fn().mockResolvedValue({
      active: true,
      unit_amount: 2900,
      recurring: { interval: 'month' },
    })
    const create = vi.fn().mockResolvedValue({ id: 'price_brand_new' })
    const update = vi.fn().mockResolvedValue({})
    const { stripe, pricesCreate, pricesUpdate } = makeStripe({ retrieve, create, update })

    const result = await syncTierPrice(stripe, 'pro', 'month', 3900, 'price_old')

    expect(result).toEqual({ priceId: 'price_brand_new', supersededPriceId: 'price_old' })
    expect(pricesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'usd',
        unit_amount: 3900,
        recurring: { interval: 'month' },
        product: 'prod_existing',
        metadata: { kind: 'subscription_pro', term: 'month' },
      })
    )
    // The old Price is NOT archived here — the caller archives it, later, via
    // archivePrices, only after its own persistence step has succeeded.
    expect(pricesUpdate).not.toHaveBeenCalled()
  })

  it('creates a new Price when there is no current id (first provisioning)', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'price_first' })
    const { stripe, pricesRetrieve, pricesUpdate } = makeStripe({ create })

    const result = await syncTierPrice(stripe, 'business', 'year', 99000, null)

    expect(result).toEqual({ priceId: 'price_first', supersededPriceId: null })
    // No current id → never retrieved, never archived.
    expect(pricesRetrieve).not.toHaveBeenCalled()
    expect(pricesUpdate).not.toHaveBeenCalled()
  })
})

describe('archivePrices', () => {
  it('archives every id in the list', async () => {
    const { stripe, pricesUpdate } = makeStripe()

    await archivePrices(stripe, ['price_a', 'price_b'])

    expect(pricesUpdate).toHaveBeenCalledWith('price_a', { active: false })
    expect(pricesUpdate).toHaveBeenCalledWith('price_b', { active: false })
  })

  it('never throws when one archive call fails, and still archives the others', async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(new Error('cannot archive'))
      .mockResolvedValueOnce({})
    const { stripe } = makeStripe({ update })

    await expect(archivePrices(stripe, ['price_bad', 'price_ok'])).resolves.toBeUndefined()
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('is a no-op for an empty list', async () => {
    const { stripe, pricesUpdate } = makeStripe()

    await archivePrices(stripe, [])

    expect(pricesUpdate).not.toHaveBeenCalled()
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

  it('no-ops and returns the EXISTING ids unchanged (with no superseded ids) when getStripeClient throws', async () => {
    getStripeClientMock.mockRejectedValue(new Error('Stripe not configured'))

    const result = await syncAllTierPrices(cfg)

    expect(result).toEqual({
      pro: { month: 'price_pro_m', year: 'price_pro_y' },
      business: { month: 'price_biz_m', year: 'price_biz_y' },
      supersededPriceIds: [],
    })
  })

  it('returns the reconciled id map with an empty supersededPriceIds when Stripe is configured and nothing changed', async () => {
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
    const { stripe, pricesUpdate } = makeStripe({ retrieve })
    getStripeClientMock.mockResolvedValue(stripe)

    const result = await syncAllTierPrices(cfg)

    expect(result).toEqual({
      pro: { month: 'price_pro_m', year: 'price_pro_y' },
      business: { month: 'price_biz_m', year: 'price_biz_y' },
      supersededPriceIds: [],
    })
    // No archiving happens inside syncAllTierPrices/syncTierPrice at all.
    expect(pricesUpdate).not.toHaveBeenCalled()
  })

  it('collects supersededPriceIds for every tier/interval whose amount changed, WITHOUT archiving them', async () => {
    // pro.month changed (2900 → mismatch), everything else matches.
    const retrieve = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'price_pro_m') {
        return { active: true, unit_amount: 1234, recurring: { interval: 'month' } } // stale amount
      }
      const amounts: Record<string, number> = {
        price_pro_y: 29000,
        price_biz_m: 9900,
        price_biz_y: 99000,
      }
      return { active: true, unit_amount: amounts[id], recurring: { interval: id.endsWith('_y') ? 'year' : 'month' } }
    })
    const create = vi.fn().mockResolvedValue({ id: 'price_pro_m_new' })
    const { stripe, pricesUpdate } = makeStripe({ retrieve, create })
    getStripeClientMock.mockResolvedValue(stripe)

    const result = await syncAllTierPrices(cfg)

    expect(result.pro.month).toBe('price_pro_m_new')
    expect(result.supersededPriceIds).toEqual(['price_pro_m'])
    // Never archived by the sync itself — that is saveBillingConfig's job,
    // after the config upsert succeeds.
    expect(pricesUpdate).not.toHaveBeenCalled()
  })
})
