import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 153 Plan 02 (CREDITUI-07) — the SINGLE riskiest test in this phase.
 *
 * Proves the atomic in-flight lock (acquireAutoTopupLock/releaseAutoTopupLock)
 * results in AT MOST ONE off-session Stripe charge when two debits race the
 * same company's threshold crossing concurrently. Mocks the RPC call-count
 * behavior to simulate the DB-level race: the FIRST caller wins the atomic
 * UPDATE, every subsequent concurrent caller observes the lock as already held.
 */

// ---- rpc call-count-aware mock ---------------------------------------------
// Keyed by companyId so different companies' locks don't interfere with each
// other across tests. First call per company succeeds; every call after that
// (for the SAME company) fails until explicitly reset in beforeEach.
const rpcCallCounts = new Map<string, number>()
let rpcShouldError = false
let rpcShouldReject = false
const releaseCalls: string[] = []

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'acquire_autotopup_lock') {
        if (rpcShouldReject) throw new Error('rpc network blip')
        if (rpcShouldError) return { data: null, error: { message: 'boom' } }
        const companyId = args.p_company_id as string
        const count = rpcCallCounts.get(companyId) ?? 0
        rpcCallCounts.set(companyId, count + 1)
        return { data: count === 0, error: null }
      }
      if (fn === 'release_autotopup_lock') {
        releaseCalls.push(args.p_company_id as string)
        if (rpcShouldReject) throw new Error('release network blip')
        return { data: null, error: null }
      }
      if (fn === 'apply_credit_ledger_entry') {
        // grantCredits' RPC — this file's tests only care about the
        // acquire/release lock race, so the grant always lands cleanly.
        return { data: [{ balance_after: 1300, applied: true }], error: null }
      }
      return { data: null, error: null }
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              auto_topup_enabled: true,
              auto_topup_threshold_credits: 100,
              auto_topup_pack_index: 0,
              stripe_customer_id: 'cus_test',
            },
            error: null,
          }),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  }),
}))

// ---- stripe-client mock -----------------------------------------------------
const paymentIntentsCreate = vi.fn().mockResolvedValue({ id: 'pi_test' })
const customersRetrieve = vi.fn().mockResolvedValue({
  invoice_settings: { default_payment_method: { id: 'pm_test' } },
})

vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: async () => ({
    customers: { retrieve: customersRetrieve },
    paymentIntents: { create: paymentIntentsCreate },
  }),
}))

// ---- billing-config mock ----------------------------------------------------
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: async () => ({
    autoTopupEnabled: true,
    topUpPacks: [{ credits: 1300, priceCents: 2000 }],
  }),
}))

// ---- ops-alert mock (avoid real Redis/Sentry/Telegram side effects) --------
vi.mock('@/lib/observability/ops-alert', () => ({
  notifyOps: vi.fn().mockResolvedValue(undefined),
}))

// ---- import under test (after the mocks) -----------------------------------
import {
  acquireAutoTopupLock,
  releaseAutoTopupLock,
  triggerAutoTopupIfNeeded,
} from '@/lib/billing/auto-topup'

const COMPANY = 'company-concurrency-test'

beforeEach(() => {
  rpcCallCounts.clear()
  rpcShouldError = false
  rpcShouldReject = false
  releaseCalls.length = 0
  paymentIntentsCreate.mockClear()
  customersRetrieve.mockClear()
})

describe('acquireAutoTopupLock', () => {
  it('returns true when the RPC resolves { data: true }', async () => {
    const result = await acquireAutoTopupLock(COMPANY)
    expect(result).toBe(true)
  })

  it('returns false when the RPC resolves { data: false } (lock already held)', async () => {
    await acquireAutoTopupLock(COMPANY) // first call wins
    const second = await acquireAutoTopupLock(COMPANY) // second call loses
    expect(second).toBe(false)
  })

  it('returns false (fails CLOSED, never throws) when the RPC call itself rejects/errors', async () => {
    rpcShouldReject = true
    await expect(acquireAutoTopupLock(COMPANY)).resolves.toBe(false)

    rpcShouldReject = false
    rpcShouldError = true
    await expect(acquireAutoTopupLock(COMPANY)).resolves.toBe(false)
  })
})

describe('triggerAutoTopupIfNeeded concurrency (the core proof)', () => {
  it('two concurrent triggers for the SAME company result in EXACTLY ONE Stripe charge', async () => {
    await Promise.all([
      triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 }),
      triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 }),
    ])

    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1)
  })
})

describe('releaseAutoTopupLock', () => {
  it('calls release_autotopup_lock RPC and never throws even if the RPC call rejects', async () => {
    rpcShouldReject = true
    await expect(releaseAutoTopupLock(COMPANY)).resolves.toBeUndefined()
    expect(releaseCalls).toContain(COMPANY)
  })
})

describe('lock release lifecycle', () => {
  it('after a successful charge, the lock is released so a LATER non-concurrent crossing can re-acquire it', async () => {
    await triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 })
    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1)
    expect(releaseCalls).toContain(COMPANY)

    // Reset the RPC call counter to simulate time passing (a fresh, later
    // threshold crossing) — the release call above cleared the lock.
    rpcCallCounts.set(COMPANY, 0)
    await triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 })
    expect(paymentIntentsCreate).toHaveBeenCalledTimes(2)
  })

  it('after a FAILED charge, the lock is STILL released (finally-equivalent)', async () => {
    paymentIntentsCreate.mockRejectedValueOnce(new Error('card declined'))
    await triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 })
    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1)
    expect(releaseCalls).toContain(COMPANY)
  })
})
