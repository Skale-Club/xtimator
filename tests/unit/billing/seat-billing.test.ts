import { describe, it, expect } from 'vitest'

/**
 * Phase 139-02 (SEAT-07) — seat math + syncSeatBilling.
 *
 * Locks the contract of lib/billing/seat-billing.ts:
 *   - computeBillableSeats(activeMembers, includedSeats) = max(0, members - included),
 *     integer, never negative, non-finite/negative inputs clamp to 0.
 *   - computeSeatChargeCents(billableSeats, seatPriceCents) = billableSeats × seatPriceCents,
 *     0 when either is non-positive.
 *
 * The pure golden cases live here (mirror estimate-fee.test.ts). The
 * syncSeatBilling behaviour suite (gating / enforcement-on quantity+unitAmount /
 * retrocompat zero-write / idempotent no-op / no-subscription / never-throw) is
 * added in Task 3 with the service-client + billing-config + stripe-client mocks.
 */

import { computeBillableSeats, computeSeatChargeCents } from '@/lib/billing/seat-billing'

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
