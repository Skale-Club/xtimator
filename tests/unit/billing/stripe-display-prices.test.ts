import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Data-integrity fix — getStripeDisplayPrices resolves the live Stripe
 * unit_amount for each of the four STRIPE_PRICE_* subscription prices so the
 * tier card can show what Stripe will actually charge. Never-throw: a missing
 * env var or a Stripe failure yields a null slot (caller falls back to config).
 * Module-level cache with a 5-minute TTL (mirrors billingConfigCache).
 */

const pricesRetrieve = vi.fn()

vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: async () => ({
    prices: { retrieve: pricesRetrieve },
  }),
}))

const { getStripeDisplayPrices, invalidateStripeDisplayPricesCache } = await import(
  '@/lib/billing/stripe-display-prices'
)

const ENV_KEYS = [
  'STRIPE_PRICE_PRO',
  'STRIPE_PRICE_PRO_ANNUAL',
  'STRIPE_PRICE_BUSINESS',
  'STRIPE_PRICE_BUSINESS_ANNUAL',
] as const

const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  invalidateStripeDisplayPricesCache()
  pricesRetrieve.mockReset()
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

describe('getStripeDisplayPrices', () => {
  it('returns all-null slots and never calls Stripe when no env vars are set', async () => {
    const result = await getStripeDisplayPrices()
    expect(result).toEqual({
      pro: { monthCents: null, yearCents: null },
      business: { monthCents: null, yearCents: null },
    })
    expect(pricesRetrieve).not.toHaveBeenCalled()
  })

  it('resolves unit_amount for the set env vars and leaves unset ones null', async () => {
    process.env.STRIPE_PRICE_PRO = 'price_pro_month'
    process.env.STRIPE_PRICE_BUSINESS_ANNUAL = 'price_biz_year'
    pricesRetrieve.mockImplementation(async (id: string) => {
      if (id === 'price_pro_month') return { unit_amount: 2900 }
      if (id === 'price_biz_year') return { unit_amount: 99000 }
      return { unit_amount: null }
    })

    const result = await getStripeDisplayPrices()
    expect(result).toEqual({
      pro: { monthCents: 2900, yearCents: null },
      business: { monthCents: null, yearCents: 99000 },
    })
  })

  it('yields a null slot (never throws) when a price retrieve rejects', async () => {
    process.env.STRIPE_PRICE_PRO = 'price_pro_month'
    pricesRetrieve.mockRejectedValue(new Error('no such price'))

    await expect(getStripeDisplayPrices()).resolves.toEqual({
      pro: { monthCents: null, yearCents: null },
      business: { monthCents: null, yearCents: null },
    })
  })

  it('caches: a second call within the TTL does not re-hit Stripe', async () => {
    process.env.STRIPE_PRICE_PRO = 'price_pro_month'
    pricesRetrieve.mockResolvedValue({ unit_amount: 2900 })

    const first = await getStripeDisplayPrices()
    const callsAfterFirst = pricesRetrieve.mock.calls.length
    const second = await getStripeDisplayPrices()

    expect(second).toEqual(first)
    // No additional Stripe calls on the cached second invocation.
    expect(pricesRetrieve.mock.calls.length).toBe(callsAfterFirst)
  })
})
