import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 144-01 (ANN-04) — interval-aware seat billing.
 *
 * Locks the contract that syncSubscriptionSeatItem reads the subscription's
 * recurring interval and:
 *   - Annual subscription + annualUnitAmount provided → uses annualUnitAmount
 *     and recurring.interval: 'year' in price_data
 *   - Monthly subscription → uses unitAmount and recurring.interval: 'month'
 *     (byte-identical to v4.12 behaviour)
 *   - Annual subscription + annualUnitAmount null/undefined → falls back to
 *     unitAmount gracefully
 *
 * Also locks syncSeatBilling integration:
 *   - Single-owner within includedSeats (billableSeats = 0) → no Stripe write
 *   - enforcementEnabled: false → no Stripe write (record-only)
 *
 * All Stripe SDK calls, service client, and billing-config are mocked.
 * NO DB, NO network, NO secrets.
 */

// ---------------------------------------------------------------------------
// Programmable Stripe SDK mock — tracks calls to subscriptionItems.update /
// subscriptionItems.create so we can assert on price_data.
// ---------------------------------------------------------------------------

type PriceData = {
  currency: string
  product: string
  unit_amount: number
  recurring: { interval: string }
}

const subscriptionItemsUpdate = vi.fn(async () => ({}))
const subscriptionItemsCreate = vi.fn(async () => ({}))
const productsSearch = vi.fn()
const productsCreate = vi.fn()

/** Configurable per-test: which interval the mock subscription advertises. */
let mockSubscriptionInterval: 'month' | 'year' = 'month'

/**
 * Optional seat item already on the subscription (for idempotency read in
 * syncSeatBilling). null = no existing seat item.
 */
let currentSeatItem: { quantity: number; unit_amount: number } | null = null

function makeMockStripe() {
  return {
    subscriptions: {
      retrieve: vi.fn(async () => ({
        currency: 'usd',
        items: {
          data: [
            // Base (non-seat) plan item is always present — this is what real
            // subscriptions look like, and it's what interval detection reads.
            {
              id: 'si_base',
              metadata: {},
              quantity: 1,
              price: { unit_amount: 2900 },
              plan: { interval: mockSubscriptionInterval },
            },
            ...(currentSeatItem
              ? [
                  {
                    id: 'si_seat',
                    metadata: { kind: 'seat' },
                    quantity: currentSeatItem.quantity,
                    price: { unit_amount: currentSeatItem.unit_amount },
                    plan: { interval: mockSubscriptionInterval },
                  },
                ]
              : []),
          ],
        },
      })),
    },
    subscriptionItems: {
      update: subscriptionItemsUpdate,
      create: subscriptionItemsCreate,
      del: vi.fn(async () => ({})),
    },
    products: {
      search: productsSearch,
      create: productsCreate,
    },
  }
}

// Provide a stable product id from ensureSeatProduct.
productsSearch.mockResolvedValue({ data: [{ id: 'prod_seat' }] })
productsCreate.mockResolvedValue({ id: 'prod_seat' })

// ---------------------------------------------------------------------------
// Mocks for syncSeatBilling integration tests (Tasks 4 & 5)
// ---------------------------------------------------------------------------

let companyRow: { tier: string | null; stripe_subscription_id: string | null } | null = {
  tier: 'pro',
  stripe_subscription_id: 'sub_1',
}
let memberCount: number | null = 1

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => makeServiceClient(),
}))

function makeServiceClient() {
  return {
    from(table: string) {
      return {
        select(_cols: string, opts?: { count?: string; head?: boolean }) {
          const chain = {
            eq() {
              return chain
            },
            async single() {
              return { data: companyRow, error: null }
            },
            then(resolve: (v: unknown) => void) {
              if (table === 'company_members' && opts?.head) {
                resolve({ data: null, count: memberCount, error: null })
              } else {
                resolve({ data: null, count: null, error: null })
              }
            },
          }
          return chain
        },
      }
    },
  }
}

let billingConfig: {
  enforcementEnabled: boolean
  seatPriceCents: number
  seatPriceAnnualCents: number | null
  tiers: Record<string, { includedSeats: number }>
} = {
  enforcementEnabled: true,
  seatPriceCents: 1500,
  seatPriceAnnualCents: 15000,
  tiers: {
    free: { includedSeats: 1 },
    pro: { includedSeats: 1 },
    business: { includedSeats: 1 },
  },
}

vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: async () => billingConfig,
}))

// getStripeClient returns the programmable mock above.
vi.mock('@/lib/billing/stripe-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/stripe-client')>()
  return {
    ...actual,
    getStripeClient: async () => makeMockStripe(),
  }
})

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import { syncSubscriptionSeatItem, SEAT_ITEM_METADATA_KIND } from '@/lib/billing/stripe-client'
import { syncSeatBilling } from '@/lib/billing/seat-billing'

beforeEach(() => {
  vi.clearAllMocks()
  // Re-apply after clearAllMocks so ensureSeatProduct still resolves.
  productsSearch.mockResolvedValue({ data: [{ id: 'prod_seat' }] })
  productsCreate.mockResolvedValue({ id: 'prod_seat' })
  subscriptionItemsUpdate.mockResolvedValue({})
  subscriptionItemsCreate.mockResolvedValue({})

  mockSubscriptionInterval = 'month'
  currentSeatItem = null
  companyRow = { tier: 'pro', stripe_subscription_id: 'sub_1' }
  memberCount = 1
  billingConfig = {
    enforcementEnabled: true,
    seatPriceCents: 1500,
    seatPriceAnnualCents: 15000,
    tiers: {
      free: { includedSeats: 1 },
      pro: { includedSeats: 1 },
      business: { includedSeats: 1 },
    },
  }
})

// ===========================================================================
// Test 1: Annual subscription + annualUnitAmount → uses annualUnitAmount +
//         recurring.interval: 'year'
// ===========================================================================
describe('ANN-04: syncSubscriptionSeatItem — annual subscription', () => {
  it('creates seat item with annualUnitAmount and interval: year when no existing seat item', async () => {
    mockSubscriptionInterval = 'year'
    currentSeatItem = null

    const mockStripe = makeMockStripe()
    await syncSubscriptionSeatItem(mockStripe as never, 'sub_annual', {
      quantity: 3,
      unitAmount: 1500,
      annualUnitAmount: 15000,
    })

    expect(subscriptionItemsCreate).toHaveBeenCalledTimes(1)
    const createCall = (subscriptionItemsCreate.mock.calls as unknown as unknown[][])[0][0] as {
      price_data: PriceData
      quantity: number
      metadata: { kind: string }
    }
    expect(createCall.quantity).toBe(3)
    expect(createCall.price_data.unit_amount).toBe(15000)
    expect(createCall.price_data.recurring.interval).toBe('year')
    expect(createCall.metadata?.kind).toBe(SEAT_ITEM_METADATA_KIND)
  })

  it('updates existing seat item with annualUnitAmount and interval: year', async () => {
    mockSubscriptionInterval = 'year'
    currentSeatItem = { quantity: 2, unit_amount: 14000 }

    const mockStripe = makeMockStripe()
    await syncSubscriptionSeatItem(mockStripe as never, 'sub_annual', {
      quantity: 3,
      unitAmount: 1500,
      annualUnitAmount: 15000,
    })

    expect(subscriptionItemsUpdate).toHaveBeenCalledTimes(1)
    const updateCall = (subscriptionItemsUpdate.mock.calls as unknown as unknown[][])[0][1] as {
      price_data: PriceData
      quantity: number
    }
    expect(updateCall.quantity).toBe(3)
    expect(updateCall.price_data.unit_amount).toBe(15000)
    expect(updateCall.price_data.recurring.interval).toBe('year')
  })
})

// ===========================================================================
// Test 2: Monthly subscription → uses unitAmount + interval: 'month'
//         (byte-identical to v4.12 behaviour)
// ===========================================================================
describe('ANN-04: syncSubscriptionSeatItem — monthly subscription', () => {
  it('creates seat item with unitAmount and interval: month', async () => {
    mockSubscriptionInterval = 'month'
    currentSeatItem = null

    const mockStripe = makeMockStripe()
    await syncSubscriptionSeatItem(mockStripe as never, 'sub_monthly', {
      quantity: 2,
      unitAmount: 1500,
      annualUnitAmount: 15000,
    })

    expect(subscriptionItemsCreate).toHaveBeenCalledTimes(1)
    const createCall = (subscriptionItemsCreate.mock.calls as unknown as unknown[][])[0][0] as {
      price_data: PriceData
      quantity: number
    }
    expect(createCall.quantity).toBe(2)
    expect(createCall.price_data.unit_amount).toBe(1500)
    expect(createCall.price_data.recurring.interval).toBe('month')
  })

  it('without annualUnitAmount still uses unitAmount and interval: month', async () => {
    mockSubscriptionInterval = 'month'
    currentSeatItem = null

    const mockStripe = makeMockStripe()
    await syncSubscriptionSeatItem(mockStripe as never, 'sub_monthly', {
      quantity: 1,
      unitAmount: 1500,
    })

    expect(subscriptionItemsCreate).toHaveBeenCalledTimes(1)
    const createCall = (subscriptionItemsCreate.mock.calls as unknown as unknown[][])[0][0] as {
      price_data: PriceData
    }
    expect(createCall.price_data.unit_amount).toBe(1500)
    expect(createCall.price_data.recurring.interval).toBe('month')
  })
})

// ===========================================================================
// Test 3: Annual subscription + annualUnitAmount null/undefined → falls back
//         to unitAmount (graceful degradation)
// ===========================================================================
describe('ANN-04: syncSubscriptionSeatItem — annual fallback when annualUnitAmount absent', () => {
  it('falls back to unitAmount when annualUnitAmount is undefined', async () => {
    mockSubscriptionInterval = 'year'
    currentSeatItem = null

    const mockStripe = makeMockStripe()
    await syncSubscriptionSeatItem(mockStripe as never, 'sub_annual', {
      quantity: 2,
      unitAmount: 1500,
      // annualUnitAmount intentionally omitted
    })

    expect(subscriptionItemsCreate).toHaveBeenCalledTimes(1)
    const createCall = (subscriptionItemsCreate.mock.calls as unknown as unknown[][])[0][0] as {
      price_data: PriceData
    }
    expect(createCall.price_data.unit_amount).toBe(1500)
    // interval still reflects the subscription's interval
    expect(createCall.price_data.recurring.interval).toBe('year')
  })

  it('falls back to unitAmount when annualUnitAmount is explicitly null', async () => {
    mockSubscriptionInterval = 'year'
    currentSeatItem = null

    const mockStripe = makeMockStripe()
    await syncSubscriptionSeatItem(mockStripe as never, 'sub_annual', {
      quantity: 2,
      unitAmount: 1500,
      annualUnitAmount: undefined,
    })

    expect(subscriptionItemsCreate).toHaveBeenCalledTimes(1)
    const createCall = (subscriptionItemsCreate.mock.calls as unknown as unknown[][])[0][0] as {
      price_data: PriceData
    }
    expect(createCall.price_data.unit_amount).toBe(1500)
    expect(createCall.price_data.recurring.interval).toBe('year')
  })
})

// ===========================================================================
// Test 4: Single-owner within includedSeats → billableSeats = 0 → no Stripe
//         write (syncSeatBilling short-circuits before calling stripe)
// ===========================================================================
describe('ANN-04: syncSeatBilling — single-owner retrocompat', () => {
  it('1 member, 1 includedSeat, enforcement ON → billable=0 → NO Stripe write', async () => {
    billingConfig.enforcementEnabled = true
    memberCount = 1 // 1 member − 1 included = 0 billable
    // No existing seat item
    currentSeatItem = null

    await syncSeatBilling('company-solo')

    // syncSubscriptionSeatItem was NOT called because we short-circuit at billableSeats <= 0
    expect(subscriptionItemsCreate).not.toHaveBeenCalled()
    expect(subscriptionItemsUpdate).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// Test 5: enforcementEnabled: false → no Stripe write (record-only)
// ===========================================================================
describe('ANN-04: syncSeatBilling — enforcement gate', () => {
  it('enforcementEnabled: false + billable>0 → NO Stripe write', async () => {
    billingConfig.enforcementEnabled = false
    memberCount = 4 // 4 − 1 included = 3 billable, but enforcement is off

    await syncSeatBilling('company-unenforced')

    expect(subscriptionItemsCreate).not.toHaveBeenCalled()
    expect(subscriptionItemsUpdate).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// Bug fix: idempotency must compare against the INTERVAL-resolved price
// (seatPriceAnnualCents for a yearly sub), not always seatPriceCents — else
// every sync on an annual subscription re-creates an inline Price forever.
// ===========================================================================
describe('ANN-04 (fix): syncSeatBilling idempotency on an annual subscription', () => {
  it('current seat item already at {billableSeats, seatPriceAnnualCents} → NO update (idempotent)', async () => {
    billingConfig.enforcementEnabled = true
    billingConfig.seatPriceCents = 1500
    billingConfig.seatPriceAnnualCents = 15000
    mockSubscriptionInterval = 'year'
    memberCount = 4 // 4 − 1 included = 3 billable
    currentSeatItem = { quantity: 3, unit_amount: 15000 } // matches the ANNUAL price, not the monthly one

    await syncSeatBilling('company-annual')

    expect(subscriptionItemsUpdate).not.toHaveBeenCalled()
    expect(subscriptionItemsCreate).not.toHaveBeenCalled()
  })

  it('current seat item at the STALE annual amount → DOES resync with seatPriceAnnualCents', async () => {
    billingConfig.enforcementEnabled = true
    billingConfig.seatPriceCents = 1500
    billingConfig.seatPriceAnnualCents = 15000
    mockSubscriptionInterval = 'year'
    memberCount = 4 // 3 billable
    currentSeatItem = { quantity: 3, unit_amount: 14000 } // stale annual price

    await syncSeatBilling('company-annual-stale')

    expect(subscriptionItemsUpdate).toHaveBeenCalledTimes(1)
    const updateCall = (subscriptionItemsUpdate.mock.calls as unknown as unknown[][])[0][1] as {
      price_data: PriceData
      quantity: number
    }
    expect(updateCall.quantity).toBe(3)
    expect(updateCall.price_data.unit_amount).toBe(15000)
    expect(updateCall.price_data.recurring.interval).toBe('year')
  })
})
