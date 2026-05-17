import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeConnectEvent } from '@/tests/fixtures/stripe-connect'

/**
 * Wave 0 GREEN: connected-account branch of the Stripe webhook handler.
 * Plan 70-04 implementation lives in:
 *   - app/api/webhooks/stripe/route.ts (top-level branch on event.account)
 *   - lib/billing/connect-webhook.ts   (handleConnectEvent — switch on type)
 *   - lib/email/payment-emails.ts      (2 Resend helpers, never throw)
 *
 * The 4 cases below verify the contract truths in the plan frontmatter:
 *   1. Events with `event.account` route to handleConnectEvent
 *   2. checkout.session.completed updates 5 estimate columns + calls both emails
 *   3. Duplicate event id hits processed_stripe_events ON CONFLICT, no emails
 *   4. account.application.deauthorized clears stripe_account_id
 */

// ------------------------------------------------------------------
// Mocks: Stripe client + Supabase service client + email helpers
// ------------------------------------------------------------------

const mockConstructEvent = vi.fn()

vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn().mockResolvedValue({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: vi.fn() },
  }),
}))

// Per-table Supabase mock. Each `.from(table)` returns its own chainable shape.
const dedupInsert = vi.fn()
const estimateUpdate = vi.fn()
const estimateUpdateEq = vi.fn()
const estimateUpdateSelect = vi.fn()
const estimateUpdateSingle = vi.fn()
const companySelect = vi.fn()
const companySelectEq = vi.fn()
const companySelectSingle = vi.fn()
const companyUpdate = vi.fn()
const companyUpdateEq = vi.fn()
const projectSelect = vi.fn()
const projectSelectEq = vi.fn()
const projectSelectSingle = vi.fn()

function resetSupabaseMocks() {
  dedupInsert.mockReset()
  estimateUpdate.mockReset()
  estimateUpdateEq.mockReset()
  estimateUpdateSelect.mockReset()
  estimateUpdateSingle.mockReset()
  companySelect.mockReset()
  companySelectEq.mockReset()
  companySelectSingle.mockReset()
  companyUpdate.mockReset()
  companyUpdateEq.mockReset()
  projectSelect.mockReset()
  projectSelectEq.mockReset()
  projectSelectSingle.mockReset()

  // Default: dedup insert succeeds (not a duplicate)
  dedupInsert.mockResolvedValue({ error: null })

  // estimates.update().eq().select().single()
  estimateUpdate.mockReturnValue({ eq: estimateUpdateEq })
  estimateUpdateEq.mockReturnValue({ select: estimateUpdateSelect })
  estimateUpdateSelect.mockReturnValue({ single: estimateUpdateSingle })
  estimateUpdateSingle.mockResolvedValue({
    data: {
      id: 'est_fixture_1',
      company_id: 'co_fixture_1',
      project_id: 'pr_fixture_1',
      share_token: 'tok_fixture_1',
    },
    error: null,
  })

  // companies.select().eq().single()
  companySelect.mockReturnValue({ eq: companySelectEq })
  companySelectEq.mockReturnValue({ single: companySelectSingle })
  companySelectSingle.mockResolvedValue({
    data: {
      email: 'owner@business.test',
      name: 'Test Business',
      stripe_account_display_name: 'Test Business Display',
    },
    error: null,
  })

  // companies.update().eq()  — used for deauthorized
  companyUpdate.mockReturnValue({ eq: companyUpdateEq })
  companyUpdateEq.mockResolvedValue({ error: null })

  // projects.select().eq().single()
  projectSelect.mockReturnValue({ eq: projectSelectEq })
  projectSelectEq.mockReturnValue({ single: projectSelectSingle })
  projectSelectSingle.mockResolvedValue({
    data: { name: 'Bathroom remodel' },
    error: null,
  })
}

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn().mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'processed_stripe_events') {
        return { insert: dedupInsert }
      }
      if (table === 'estimates') {
        return { update: estimateUpdate }
      }
      if (table === 'companies') {
        return { select: companySelect, update: companyUpdate }
      }
      if (table === 'projects') {
        return { select: projectSelect }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }),
}))

const sendPaymentReceivedEmail = vi.fn().mockResolvedValue(undefined)
const sendPaymentReceiptEmail = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/email/payment-emails', () => ({
  sendPaymentReceivedEmail: (...args: unknown[]) =>
    sendPaymentReceivedEmail(...args),
  sendPaymentReceiptEmail: (...args: unknown[]) =>
    sendPaymentReceiptEmail(...args),
}))

vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')

// Late import so vi.mock applies before module load.
const { POST } = await import('@/app/api/webhooks/stripe/route')

function makeRequest(body = '{}') {
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body,
    headers: {
      'stripe-signature': 'sig_test',
      'Content-Type': 'application/json',
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetSupabaseMocks()
  sendPaymentReceivedEmail.mockReset().mockResolvedValue(undefined)
  sendPaymentReceiptEmail.mockReset().mockResolvedValue(undefined)
})

describe('stripe connect webhook events', () => {
  it('routes events with event.account to the Connect handler', async () => {
    // Fixture sanity — discriminator is present
    const event = makeConnectEvent('checkout.session.completed')
    expect(event.account).toBe('acct_test_123')

    // Connect handler module now exists
    const mod = await import('@/lib/billing/connect-webhook')
    expect(typeof mod.handleConnectEvent).toBe('function')

    // End-to-end: a Connect event flowing through POST hits the estimates table
    mockConstructEvent.mockReturnValue(event)
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(estimateUpdate).toHaveBeenCalled() // proves Connect branch was taken
  })

  it('marks the estimate paid and populates the 4 payment columns', async () => {
    const event = makeConnectEvent('checkout.session.completed')
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    // estimates.update called with the 5 payment fields (plan truth)
    expect(estimateUpdate).toHaveBeenCalledTimes(1)
    const updatePayload = estimateUpdate.mock.calls[0][0]
    expect(updatePayload).toMatchObject({
      payment_status: 'paid',
      stripe_checkout_session_id: 'cs_test_connect_123',
      stripe_payment_intent_id: 'pi_test_connect_123',
      payment_amount_cents: 50000,
    })
    expect(typeof updatePayload.paid_at).toBe('string') // ISO timestamp

    // .eq('id', estimateId)
    expect(estimateUpdateEq).toHaveBeenCalledWith('id', 'est_fixture_1')

    // Both email helpers fired exactly once
    expect(sendPaymentReceivedEmail).toHaveBeenCalledTimes(1)
    expect(sendPaymentReceiptEmail).toHaveBeenCalledTimes(1)
  })

  it('skips duplicate events via processed_stripe_events ON CONFLICT', async () => {
    // Simulate duplicate insert — Postgres unique violation
    dedupInsert.mockResolvedValueOnce({ error: { code: '23505' } })

    const event = makeConnectEvent('checkout.session.completed')
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Already processed')

    // Critically: NO email send and NO estimate update on duplicate
    expect(estimateUpdate).not.toHaveBeenCalled()
    expect(sendPaymentReceivedEmail).not.toHaveBeenCalled()
    expect(sendPaymentReceiptEmail).not.toHaveBeenCalled()
  })

  it('clears stripe_account_id on account.application.deauthorized', async () => {
    const event = {
      ...makeConnectEvent('account.application.deauthorized'),
      type: 'account.application.deauthorized',
    }
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(companyUpdate).toHaveBeenCalledWith({
      stripe_account_id: null,
      stripe_connect_status: 'disconnected',
    })
    expect(companyUpdateEq).toHaveBeenCalledWith(
      'stripe_account_id',
      'acct_test_123'
    )
    // No payment-related side effects
    expect(estimateUpdate).not.toHaveBeenCalled()
    expect(sendPaymentReceivedEmail).not.toHaveBeenCalled()
  })
})
