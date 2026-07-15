import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 139-02 (SEAT-07) — seat math + syncSeatBilling.
 *
 * Locks the contract of lib/billing/seat-billing.ts:
 *   - computeBillableSeats(activeMembers, includedSeats) = max(0, members - included),
 *     integer, never negative, non-finite/negative inputs clamp to 0.
 *   - computeSeatChargeCents(billableSeats, seatPriceCents) = billableSeats × seatPriceCents,
 *     0 when either is non-positive.
 *   - syncSeatBilling: enforcement OFF → NO Stripe write (record-only);
 *     enforcement ON + billable>0 → ONE call with { quantity, unitAmount };
 *     single-owner retrocompat (billable=0) → NO write in either mode;
 *     unchanged quantity+unitAmount → idempotent no-op; no subscription → no write;
 *     Stripe/DB error → RESOLVES (never throws — a membership op is never rolled back).
 *
 * The service client + billing-config reader + stripe-client are mocked. NO DB,
 * NO network, NO secrets — pure unit tests over the never-throw helper shape.
 */

// ---- service-client mock (requireServiceClient) -----------------------------
// Programmable per-test: the companies.single() row + the company_members
// head:true count.
let companyRow: { tier: string | null; stripe_subscription_id: string | null } | null = {
  tier: 'pro',
  stripe_subscription_id: 'sub_1',
}
let memberCount: number | null = 1
let serviceThrows = false

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => {
    if (serviceThrows) throw new Error('service client exploded')
    return makeServiceClient()
  },
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
              // companies row
              return { data: companyRow, error: null }
            },
            // company_members count query: select('user_id', {count, head}).eq() awaited
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

// ---- billing-config mock (getBillingConfig) ---------------------------------
let billingConfig: {
  enforcementEnabled: boolean
  seatPriceCents: number
  tiers: Record<string, { includedSeats: number }>
} = {
  enforcementEnabled: false,
  seatPriceCents: 1500,
  tiers: { free: { includedSeats: 1 }, pro: { includedSeats: 1 }, business: { includedSeats: 1 } },
}

vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: async () => billingConfig,
}))

// ---- stripe-client mock -----------------------------------------------------
// getStripeClient returns a fake Stripe whose subscriptions.retrieve yields the
// current seat item (for the idempotency read). syncSubscriptionSeatItem is the
// spied SDK boundary the decision drives.
const syncSeatItemSpy = vi.fn(async (..._args: unknown[]) => {})
let currentSeatItem: { quantity: number; unitAmount: number } | null = null
let retrieveThrows = false

vi.mock('@/lib/billing/stripe-client', () => ({
  SEAT_ITEM_METADATA_KIND: 'seat',
  syncSubscriptionSeatItem: (...args: unknown[]) => syncSeatItemSpy(...args),
  getStripeClient: async () => ({
    subscriptions: {
      retrieve: async () => {
        if (retrieveThrows) throw new Error('stripe retrieve exploded')
        return {
          currency: 'usd',
          items: {
            data: currentSeatItem
              ? [
                  {
                    id: 'si_seat',
                    metadata: { kind: 'seat' },
                    quantity: currentSeatItem.quantity,
                    price: { unit_amount: currentSeatItem.unitAmount },
                  },
                ]
              : [],
          },
        }
      },
    },
  }),
}))

// ---- import under test (after the mocks) ------------------------------------
import {
  computeBillableSeats,
  computeSeatChargeCents,
  syncSeatBilling,
} from '@/lib/billing/seat-billing'

beforeEach(() => {
  companyRow = { tier: 'pro', stripe_subscription_id: 'sub_1' }
  memberCount = 1
  serviceThrows = false
  retrieveThrows = false
  currentSeatItem = null
  syncSeatItemSpy.mockClear()
  billingConfig = {
    enforcementEnabled: false,
    seatPriceCents: 1500,
    tiers: { free: { includedSeats: 1 }, pro: { includedSeats: 1 }, business: { includedSeats: 1 } },
  }
})

// =============================================================================
// SEAT-07 — computeBillableSeats (pure)
// =============================================================================
describe('SEAT-07: computeBillableSeats', () => {
  it('5 members, 1 included → 4 billable', () => {
    expect(computeBillableSeats(5, 1)).toBe(4)
  })

  it('1 member, 1 included → 0 (members <= included)', () => {
    expect(computeBillableSeats(1, 1)).toBe(0)
  })

  it('1 member, 5 included → 0 (never negative)', () => {
    expect(computeBillableSeats(1, 5)).toBe(0)
  })

  it('0 members, 0 included → 0', () => {
    expect(computeBillableSeats(0, 0)).toBe(0)
  })

  it('never negative — clamps at 0', () => {
    expect(computeBillableSeats(2, 10)).toBe(0)
  })

  it('non-finite members clamp to 0', () => {
    expect(computeBillableSeats(Number.NaN, 1)).toBe(0)
    expect(computeBillableSeats(Number.POSITIVE_INFINITY, 1)).toBe(0)
  })

  it('negative inputs clamp safely (never below 0)', () => {
    expect(computeBillableSeats(-3, 1)).toBe(0)
    expect(computeBillableSeats(5, -2)).toBe(7) // -2 floored = -2 → 5 - (-2) = 7, still integer >= 0
  })

  it('always returns an integer (floors fractional inputs)', () => {
    expect(Number.isInteger(computeBillableSeats(5.9, 1.2))).toBe(true)
    expect(computeBillableSeats(5.9, 1.2)).toBe(4) // floor(5.9)=5, floor(1.2)=1 → 4
  })
})

// =============================================================================
// SEAT-07 — computeSeatChargeCents (pure)
// =============================================================================
describe('SEAT-07: computeSeatChargeCents', () => {
  it('4 seats × 1500 = 6000 cents', () => {
    expect(computeSeatChargeCents(4, 1500)).toBe(6000)
  })

  it('0 seats → 0', () => {
    expect(computeSeatChargeCents(0, 1500)).toBe(0)
  })

  it('zero/placeholder price → 0', () => {
    expect(computeSeatChargeCents(3, 0)).toBe(0)
  })

  it('negative seats → 0', () => {
    expect(computeSeatChargeCents(-2, 1500)).toBe(0)
  })

  it('always returns an integer number of cents', () => {
    expect(Number.isInteger(computeSeatChargeCents(3, 1500))).toBe(true)
  })
})

// =============================================================================
// SEAT-07 — syncSeatBilling (gated / idempotent / retrocompat / never-throw)
// =============================================================================
const COMPANY = '11111111-1111-1111-1111-111111111111'

describe('SEAT-07: syncSeatBilling', () => {
  it('enforcement OFF + billable>0 → NO Stripe write (record-only)', async () => {
    billingConfig.enforcementEnabled = false
    memberCount = 4 // 4 - 1 included = 3 billable
    await syncSeatBilling(COMPANY)
    expect(syncSeatItemSpy).not.toHaveBeenCalled()
  })

  it('enforcement ON + billable>0 → ONE call with { quantity, unitAmount }', async () => {
    billingConfig.enforcementEnabled = true
    billingConfig.seatPriceCents = 1500
    memberCount = 4 // 4 - 1 included = 3
    await syncSeatBilling(COMPANY)
    expect(syncSeatItemSpy).toHaveBeenCalledTimes(1)
    // args: (stripe, subscriptionId, { quantity, unitAmount })
    const [, subscriptionId, desired] = syncSeatItemSpy.mock.calls[0] as [
      unknown,
      string,
      { quantity: number; unitAmount: number },
    ]
    expect(subscriptionId).toBe('sub_1')
    expect(desired).toEqual({ quantity: 3, unitAmount: 1500 })
  })

  it('single-owner retrocompat: activeMembers=1, included=1, enforcement ON → billable=0 → NO write', async () => {
    billingConfig.enforcementEnabled = true
    memberCount = 1 // 1 - 1 = 0 billable
    await syncSeatBilling(COMPANY)
    expect(syncSeatItemSpy).not.toHaveBeenCalled()
  })

  it('idempotent: current seat item already at the computed quantity+unitAmount → NO update', async () => {
    billingConfig.enforcementEnabled = true
    billingConfig.seatPriceCents = 1500
    memberCount = 4 // → 3 billable
    currentSeatItem = { quantity: 3, unitAmount: 1500 } // already matches
    await syncSeatBilling(COMPANY)
    expect(syncSeatItemSpy).not.toHaveBeenCalled()
  })

  it('changed quantity → DOES call the update', async () => {
    billingConfig.enforcementEnabled = true
    billingConfig.seatPriceCents = 1500
    memberCount = 4 // → 3 billable
    currentSeatItem = { quantity: 2, unitAmount: 1500 } // stale quantity
    await syncSeatBilling(COMPANY)
    expect(syncSeatItemSpy).toHaveBeenCalledTimes(1)
  })

  it('no stripe_subscription_id → NO Stripe write', async () => {
    billingConfig.enforcementEnabled = true
    memberCount = 4 // billable>0
    companyRow = { tier: 'pro', stripe_subscription_id: null }
    await syncSeatBilling(COMPANY)
    expect(syncSeatItemSpy).not.toHaveBeenCalled()
  })

  it('Stripe/DB error → RESOLVES (never throws — membership op is never rolled back)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    billingConfig.enforcementEnabled = true
    memberCount = 4
    retrieveThrows = true // Stripe blows up mid-sync
    await expect(syncSeatBilling(COMPANY)).resolves.toBeUndefined()
    expect(syncSeatItemSpy).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('service-client throw → RESOLVES (never throws)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    serviceThrows = true
    await expect(syncSeatBilling(COMPANY)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('unknown tier falls back to free includedSeats (null-safe, no throw)', async () => {
    billingConfig.enforcementEnabled = true
    billingConfig.seatPriceCents = 1500
    companyRow = { tier: 'enterprise_unknown', stripe_subscription_id: 'sub_1' }
    memberCount = 4 // free includedSeats=1 → 3 billable
    await syncSeatBilling(COMPANY)
    expect(syncSeatItemSpy).toHaveBeenCalledTimes(1)
    const [, , desired] = syncSeatItemSpy.mock.calls[0] as [
      unknown,
      string,
      { quantity: number; unitAmount: number },
    ]
    expect(desired).toEqual({ quantity: 3, unitAmount: 1500 })
  })
})
