import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { BillingOperation } from '@/lib/billing/operations'

const ops = vi.hoisted(() => ({ reserve: vi.fn(), claim: vi.fn(), save: vi.fn(), release: vi.fn(), canReplay: vi.fn() }))
vi.mock('@/lib/billing/operations', () => ({
  reserveBillingOperation: ops.reserve,
  claimBillingOperation: ops.claim,
  saveBillingOperation: ops.save,
  releaseBillingOperation: ops.release,
  canReplayStripeCreate: ops.canReplay,
}))

import { createSubscriptionCheckout } from '@/lib/billing/subscription-checkout'

const frozen: Stripe.Checkout.SessionCreateParams = {
  mode: 'subscription', customer: 'cus_company',
  line_items: [{ price: 'price_month_original', quantity: 1 }],
  metadata: { companyId: 'company' },
}
let operation: BillingOperation
const list = vi.fn()
const create = vi.fn()
const retrieve = vi.fn()
const stripe = { subscriptions: { list }, checkout: { sessions: { create, retrieve } } } as unknown as Stripe
const open = { id: 'cs_original', status: 'open', url: 'https://checkout.stripe.com/pay/original' }

beforeEach(() => {
  vi.clearAllMocks()
  operation = {
    id: 'operation_original', company_id: 'company', kind: 'subscription_checkout', request_key: 'first-click',
    request: frozen as Record<string, unknown>, status: 'pending', stripe_object_id: null,
    result: {}, created_at: new Date().toISOString(),
  }
  list.mockImplementation(() => (async function* () {})())
  create.mockResolvedValue(open)
  retrieve.mockResolvedValue(open)
  ops.reserve.mockImplementation(async () => operation)
  ops.claim.mockResolvedValue('lease')
  ops.save.mockResolvedValue(undefined)
  ops.release.mockResolvedValue(undefined)
  ops.canReplay.mockReturnValue(true)
})

describe('durable subscription Checkout', () => {
  it('uses the frozen operation parameters when a later request chooses another interval', async () => {
    const changed = { ...frozen, line_items: [{ price: 'price_new_annual', quantity: 1 }] }
    expect(await createSubscriptionCheckout(stripe, 'company', changed)).toBe(open.url)
    expect(create).toHaveBeenCalledWith(frozen, { idempotencyKey: 'subscription-checkout:operation_original' })
    expect(ops.save).toHaveBeenCalledWith('operation_original', 'lease', { stripe_object_id: 'cs_original', status: 'checkout' })
    expect(ops.release).toHaveBeenCalledWith('operation_original', 'lease')
  })

  it('replays the same Stripe key after a lost create response rather than opening a distinct checkout', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('Response lost'), { type: 'StripeConnectionError' }))
    await expect(createSubscriptionCheckout(stripe, 'company', frozen)).rejects.toThrow('Response lost')
    expect(ops.save).not.toHaveBeenCalled()
    expect(ops.release).toHaveBeenCalledOnce()

    await createSubscriptionCheckout(stripe, 'company', { ...frozen, metadata: { companyId: 'company', click: 'retry' } })
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[1]).toEqual(create.mock.calls[0])
  })

  it.each(['StripeConnectionError', 'resource_missing'])('never creates a replacement after known-session retrieval fails: %s', async (code) => {
    operation.stripe_object_id = 'cs_original'
    retrieve.mockRejectedValueOnce(Object.assign(new Error('Cannot retrieve original'), { code }))
    await expect(createSubscriptionCheckout(stripe, 'company', frozen)).rejects.toThrow('Cannot retrieve original')
    expect(create).not.toHaveBeenCalled()
    expect(ops.release).toHaveBeenCalledWith('operation_original', 'lease')
  })

  it.each([
    ['complete', 'completed', 'being confirmed'],
    ['expired', 'failed', 'expired'],
  ])('records a %s session and refuses a new payment in that call', async (status, savedStatus, message) => {
    operation.stripe_object_id = 'cs_original'
    retrieve.mockResolvedValue({ ...open, status })
    await expect(createSubscriptionCheckout(stripe, 'company', frozen)).rejects.toThrow(message)
    expect(ops.save).toHaveBeenCalledWith('operation_original', 'lease', { status: savedStatus })
    expect(create).not.toHaveBeenCalled()
    expect(ops.release).toHaveBeenCalledOnce()
  })

  it.each(['active', 'trialing', 'past_due', 'incomplete', 'unpaid', 'paused'])('rejects a remotely existing %s subscription before reserving another', async (status) => {
    list.mockImplementation(() => (async function* () { yield { id: 'sub_existing', status } })())
    await expect(createSubscriptionCheckout(stripe, 'company', frozen)).rejects.toThrow('subscription already exists')
    expect(ops.reserve).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('allows a company whose old remote subscriptions have ended', async () => {
    list.mockImplementation(() => (async function* () {
      yield { status: 'canceled' }
      yield { status: 'incomplete_expired' }
    })())
    expect(await createSubscriptionCheckout(stripe, 'company', frozen)).toBe(open.url)
  })

  it('refuses to create after the Stripe replay window has elapsed', async () => {
    ops.canReplay.mockReturnValue(false)
    await expect(createSubscriptionCheckout(stripe, 'company', frozen)).rejects.toThrow('needs verification')
    expect(create).not.toHaveBeenCalled()
    expect(ops.release).toHaveBeenCalledOnce()
  })

  it('refuses a busy operation without creating a new payment', async () => {
    ops.claim.mockResolvedValue(null)
    await expect(createSubscriptionCheckout(stripe, 'company', frozen)).rejects.toThrow('being prepared')
    expect(create).not.toHaveBeenCalled()
  })
})
