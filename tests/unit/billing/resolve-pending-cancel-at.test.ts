import { describe, it, expect, vi } from 'vitest'
import type Stripe from 'stripe'

vi.mock('@/lib/supabase/server', () => ({}))

import { resolvePendingCancelAt } from '@/lib/billing/stripe-client'

const PERIOD_END = 1900000000
const CANCEL_AT = 1796752621

function sub(over: Record<string, unknown>): Stripe.Subscription {
  return {
    id: 'sub_test',
    cancel_at_period_end: false,
    cancel_at: null,
    items: { data: [{ id: 'si_1', metadata: {}, current_period_end: PERIOD_END }] },
    ...over,
  } as unknown as Stripe.Subscription
}

describe('resolvePendingCancelAt', () => {
  it('dahlia: cancel_at set with cancel_at_period_end false -> cancel_at ISO', () => {
    expect(resolvePendingCancelAt(sub({ cancel_at: CANCEL_AT }))).toBe(
      new Date(CANCEL_AT * 1000).toISOString()
    )
  })

  it('legacy: cancel_at_period_end true with cancel_at -> cancel_at ISO', () => {
    expect(
      resolvePendingCancelAt(sub({ cancel_at_period_end: true, cancel_at: CANCEL_AT }))
    ).toBe(new Date(CANCEL_AT * 1000).toISOString())
  })

  it('cancel_at_period_end true without cancel_at -> period end', () => {
    expect(resolvePendingCancelAt(sub({ cancel_at_period_end: true }))).toBe(
      new Date(PERIOD_END * 1000).toISOString()
    )
  })

  it('cancel_at_period_end true with no period end -> null, never an Invalid Date', () => {
    expect(
      resolvePendingCancelAt(sub({ cancel_at_period_end: true, items: { data: [] } }))
    ).toBeNull()
  })

  it('resume (cancel_at null, cancel_at_period_end false) -> null', () => {
    expect(resolvePendingCancelAt(sub({}))).toBeNull()
  })
})
