import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: vi.fn(), db: vi.fn(), process: vi.fn(), resume: vi.fn(), issue: vi.fn(), writable: vi.fn(), notify: vi.fn(),
  retrieveEvent: vi.fn(), sessions: vi.fn(), intents: vi.fn(), createIntent: vi.fn(), createSession: vi.fn(),
}))
vi.mock('@/lib/inngest/client', () => ({ inngest: { createFunction: vi.fn(() => ({})) } }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: mocks.db }))
vi.mock('@/lib/billing/stripe-client', () => ({ getStripeClient: mocks.client }))
vi.mock('@/lib/billing/stripe-event-processing', () => ({ processVerifiedStripeEvent: mocks.process }))
vi.mock('@/lib/billing/credit-purchase', () => ({ resumeCreditPurchase: mocks.resume }))
vi.mock('@/lib/billing/invoice-reservation', () => ({ issueReservedInvoice: mocks.issue }))
vi.mock('@/lib/demo/guard', () => ({ assertCompanyWritable: mocks.writable }))
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: mocks.notify }))

import { recoverPayments } from '@/lib/inngest/functions/payment-recovery'

let rows: Record<string, Array<Record<string, unknown>>>
let errors: Record<string, string>
const writes: Array<{ table: string; payload: unknown; filters: unknown[][] }> = []
const stripe = {
  events: { retrieve: mocks.retrieveEvent },
  checkout: { sessions: { list: mocks.sessions, create: mocks.createSession } },
  paymentIntents: { list: mocks.intents, create: mocks.createIntent },
}

function query(table: string) {
  let payload: unknown
  const filters: unknown[][] = []
  // The fixture models query responses only; SQL leasing is covered separately.
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'neq', 'lt', 'or', 'order', 'limit', 'eq', 'in', 'is']) {
    chain[method] = (...args: unknown[]) => { filters.push([method, ...args]); return chain }
  }
  chain.update = (next: unknown) => { payload = next; return chain }
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
    if (payload !== undefined) writes.push({ table, payload, filters })
    return Promise.resolve({
      data: payload === undefined ? rows[table] ?? [] : null,
      error: errors[table] ? { message: errors[table] } : null,
    }).then(resolve, reject)
  }
  return chain
}

const purchase = (overrides: Record<string, unknown> = {}) => ({
  id: 'operation_1', company_id: 'company_1', kind: 'credit_purchase', status: 'pending',
  stripe_object_id: null, request: { customerId: 'cus_company' }, created_at: '2026-11-23T18:00:00Z',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  rows = { processed_stripe_events: [], billing_operations: [], invoices: [] }
  errors = {}
  writes.length = 0
  mocks.db.mockReturnValue({ from: query })
  mocks.client.mockResolvedValue(stripe)
  mocks.retrieveEvent.mockImplementation(async id => ({ id, type: 'unknown.event', data: { object: {} } }))
  mocks.process.mockResolvedValue(new Response('OK', { status: 200 }))
  mocks.resume.mockResolvedValue({ mode: 'charged', granted: true })
  mocks.issue.mockResolvedValue(undefined)
  mocks.writable.mockResolvedValue(null)
  mocks.notify.mockResolvedValue(undefined)
  mocks.sessions.mockImplementation(() => (async function* () {})())
  mocks.intents.mockImplementation(() => (async function* () {})())
})

describe('payment recovery job', () => {
  it('retrieves inbox Events through Stripe with the originating connected account before processing', async () => {
    rows.processed_stripe_events = [
      { event_id: 'evt_platform', stripe_account_id: null },
      { event_id: 'evt_connect', stripe_account_id: 'acct_origin' },
    ]
    expect(await recoverPayments()).toEqual({ recovered: 2, failures: 0 })
    expect(mocks.retrieveEvent).toHaveBeenCalledWith('evt_platform', {}, {})
    expect(mocks.retrieveEvent).toHaveBeenCalledWith('evt_connect', {}, { stripeAccount: 'acct_origin' })
    expect(mocks.process).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt_connect' }), stripe)
    expect(mocks.retrieveEvent.mock.invocationCallOrder[0]).toBeLessThan(mocks.process.mock.invocationCallOrder[0])
  })

  it('reports failed event processing while continuing the other recoveries', async () => {
    rows.processed_stripe_events = [{ event_id: 'evt_failure' }, { event_id: 'evt_next' }]
    mocks.process.mockResolvedValueOnce(new Response('Retry', { status: 500 }))
    expect(await recoverPayments()).toEqual({ recovered: 1, failures: 1 })
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'payment_recovery_pending' }))
  })

  it('resumes a known purchase in recovery-only mode without creating a new charge', async () => {
    rows.billing_operations = [purchase({ status: 'checkout', stripe_object_id: 'cs_original' })]
    expect(await recoverPayments()).toEqual({ recovered: 1, failures: 0 })
    expect(mocks.resume).toHaveBeenCalledWith(stripe, expect.objectContaining({ stripe_object_id: 'cs_original' }), { recoveryOnly: true })
    expect(mocks.createIntent).not.toHaveBeenCalled()
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it('finds a lost Checkout response by immutable operation metadata before resuming it', async () => {
    rows.billing_operations = [purchase()]
    mocks.sessions.mockImplementation(() => (async function* () {
      yield { id: 'cs_unrelated', metadata: { operationId: 'someone_else' } }
      yield { id: 'cs_original', metadata: { operationId: 'operation_1' } }
    })())
    expect(await recoverPayments()).toEqual({ recovered: 1, failures: 0 })
    expect(writes).toContainEqual(expect.objectContaining({
      table: 'billing_operations', payload: { stripe_object_id: 'cs_original', status: 'checkout' },
    }))
    expect(mocks.resume).toHaveBeenCalledWith(stripe, expect.objectContaining({ stripe_object_id: 'cs_original' }), { recoveryOnly: true })
    expect(mocks.intents).not.toHaveBeenCalled()
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it('finds a lost PaymentIntent response by operation metadata without a new create', async () => {
    rows.billing_operations = [purchase()]
    mocks.intents.mockImplementation(() => (async function* () {
      yield { id: 'pi_original', metadata: { operationId: 'operation_1' } }
    })())
    expect(await recoverPayments()).toEqual({ recovered: 1, failures: 0 })
    expect(mocks.resume).toHaveBeenCalledWith(stripe, expect.objectContaining({ stripe_object_id: 'pi_original' }), { recoveryOnly: true })
    expect(mocks.createIntent).not.toHaveBeenCalled()
  })

  it('leaves an unknown original outcome pending instead of starting a payment', async () => {
    rows.billing_operations = [purchase()]
    expect(await recoverPayments()).toEqual({ recovered: 0, failures: 1 })
    expect(mocks.resume).not.toHaveBeenCalled()
    expect(mocks.createIntent).not.toHaveBeenCalled()
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it('skips demo-company purchases and invoice reservations', async () => {
    rows.billing_operations = [purchase()]
    rows.invoices = [{ id: 'invoice_1', company_id: 'company_1' }]
    mocks.writable.mockResolvedValue({ error: 'Read-only demo' })
    expect(await recoverPayments()).toEqual({ recovered: 0, failures: 0 })
    expect(mocks.resume).not.toHaveBeenCalled()
    expect(mocks.issue).not.toHaveBeenCalled()
  })

  it('retries the job if the recovery inbox cannot be read', async () => {
    errors.processed_stripe_events = 'Database unavailable'
    await expect(recoverPayments()).rejects.toThrow('Cannot read Stripe recovery inbox')
    expect(mocks.retrieveEvent).not.toHaveBeenCalled()
  })

  it('recovers an existing authorized invoice reservation', async () => {
    rows.invoices = [{ id: 'invoice_1', company_id: 'company_1', stripe_account_id: 'acct_origin' }]
    expect(await recoverPayments()).toEqual({ recovered: 1, failures: 0 })
    expect(mocks.issue).toHaveBeenCalledWith(rows.invoices[0])
  })
})
