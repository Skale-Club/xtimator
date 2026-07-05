import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 153 Plan 02 (CREDITUI-07) — trigger logic behavioral contract +
 * credit-ledger.ts wiring proof.
 *
 * Black-box tests of the exported triggerAutoTopupIfNeeded (chargeAutoTopup is
 * NOT exported — matching the module's public-surface design from Task 2).
 * Covers threshold independence from billing_config.lowBalanceThresholds, the
 * platform kill switch, the tenant opt-in, and never-throw behavior under every
 * failure mode (Stripe decline, missing payment method).
 */

// ---- supabase service-client mock (chainable fake, follows credit-ledger.ts's
// own test conventions from tests/unit/billing/credit-ledger.test.ts) ---------
let companyRow: {
  auto_topup_enabled?: boolean
  auto_topup_threshold_credits?: number | null
  auto_topup_pack_index?: number | null
  stripe_customer_id?: string | null
} | null = null

const updates: Array<{ table: string; payload: Record<string, unknown> }> = []

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    rpc: async () => ({ data: true, error: null }), // lock always granted in this file's tests
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: companyRow, error: null }),
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: async () => {
          updates.push({ table, payload })
          return { error: null }
        },
      }),
    }),
  }),
}))

// ---- stripe-client mock ------------------------------------------------------
const paymentIntentsCreate = vi.fn().mockResolvedValue({ id: 'pi_test' })
let customerRetrieveResult: unknown = {
  invoice_settings: { default_payment_method: { id: 'pm_test' } },
}
const customersRetrieve = vi.fn(async () => customerRetrieveResult)

vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: async () => ({
    customers: { retrieve: customersRetrieve },
    paymentIntents: { create: paymentIntentsCreate },
  }),
}))

// ---- billing-config mock -----------------------------------------------------
let billingConfig: { autoTopupEnabled: boolean; topUpPacks: Array<{ credits: number; priceCents: number }> } = {
  autoTopupEnabled: true,
  topUpPacks: [{ credits: 1300, priceCents: 2000 }],
}

vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: async () => billingConfig,
}))

// ---- import under test (after the mocks) -------------------------------------
import { triggerAutoTopupIfNeeded } from '@/lib/billing/auto-topup'

const COMPANY = 'company-trigger-test'

beforeEach(() => {
  companyRow = {
    auto_topup_enabled: true,
    auto_topup_threshold_credits: 100,
    auto_topup_pack_index: 0,
    stripe_customer_id: 'cus_test',
  }
  billingConfig = {
    autoTopupEnabled: true,
    topUpPacks: [{ credits: 1300, priceCents: 2000 }],
  }
  customerRetrieveResult = {
    invoice_settings: { default_payment_method: { id: 'pm_test' } },
  }
  updates.length = 0
  paymentIntentsCreate.mockClear()
  paymentIntentsCreate.mockResolvedValue({ id: 'pi_test' })
  customersRetrieve.mockClear()
})

describe('CREDITUI-07: threshold independence (Pitfall 3)', () => {
  it('does NOT charge when newBalance is above the tenant own threshold (150 >= 100)', async () => {
    await triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 150 })
    expect(paymentIntentsCreate).not.toHaveBeenCalled()
  })

  it('DOES charge exactly once when newBalance is below the tenant own threshold (50 < 100)', async () => {
    await triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 })
    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1)
  })
})

describe('CREDITUI-07: platform kill switch', () => {
  it('returns immediately without querying companies when billing_config.autoTopupEnabled is false', async () => {
    billingConfig.autoTopupEnabled = false
    // companyRow is intentionally left null so any read of it would blow up the
    // `.auto_topup_enabled` access below — proving the function short-circuits
    // BEFORE it ever reaches the companies query.
    companyRow = null
    await expect(
      triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 })
    ).resolves.toBeUndefined()
    expect(paymentIntentsCreate).not.toHaveBeenCalled()
  })
})

describe('CREDITUI-07: tenant opt-out', () => {
  it('does NOT charge when the company own auto_topup_enabled is false, even if the platform switch is on', async () => {
    companyRow!.auto_topup_enabled = false
    await triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 })
    expect(paymentIntentsCreate).not.toHaveBeenCalled()
  })
})

describe('CREDITUI-07: never-throws under failure', () => {
  it('resolves without throwing on a Stripe decline, and sets auto_topup_last_failed_at', async () => {
    paymentIntentsCreate.mockRejectedValueOnce(new Error('card declined'))
    await expect(
      triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 })
    ).resolves.toBeUndefined()
    const failUpdate = updates.find(
      (u) => u.table === 'companies' && 'auto_topup_last_failed_at' in u.payload
    )
    expect(failUpdate).toBeDefined()
    expect(failUpdate?.payload.auto_topup_last_failed_at).not.toBeNull()
  })

  it('resolves without throwing and does NOT call paymentIntents.create when there is no payment method', async () => {
    customerRetrieveResult = { invoice_settings: { default_payment_method: null } }
    await expect(
      triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 })
    ).resolves.toBeUndefined()
    expect(paymentIntentsCreate).not.toHaveBeenCalled()
  })
})

// =============================================================================
// Wiring proof (Task 3): recordCreditDebit calls triggerAutoTopupIfNeeded
// directly after notifyLowCreditBalance on every successful debit.
// =============================================================================
describe('CREDITUI-07: credit-ledger.ts wiring', () => {
  it('recordCreditDebit calls triggerAutoTopupIfNeeded with { companyId, newBalance } after a successful debit', async () => {
    vi.resetModules()

    const triggerMock = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/billing/auto-topup', () => ({
      triggerAutoTopupIfNeeded: triggerMock,
    }))
    vi.doMock('@/lib/notifications/dispatch', () => ({
      notify: vi.fn().mockResolvedValue({ ok: true }),
    }))
    vi.doMock('@/lib/notifications/copy', () => ({
      buildNotificationCopy: vi.fn().mockReturnValue({ title: 't', body: 'b' }),
    }))

    const ledgerCaptured: Array<{ table: string; payload: Record<string, unknown> }> = []
    vi.doMock('@/lib/supabase/service', () => ({
      requireServiceClient: () => ({
        from: (table: string) => ({
          select: () => {
            const chain = {
              eq: () => chain,
              limit: () => chain,
              async maybeSingle() {
                return { data: null, error: null } // no existing dedup row
              },
              async single() {
                return { data: { credit_balance: 100 }, error: null } // current balance
              },
            }
            return chain
          },
          insert: (payload: Record<string, unknown>) => {
            ledgerCaptured.push({ table, payload })
            return Promise.resolve({ error: null })
          },
          update: (payload: Record<string, unknown>) => {
            ledgerCaptured.push({ table, payload })
            return { eq: async () => Promise.resolve({ error: null }) }
          },
        }),
      }),
    }))
    vi.doMock('@/lib/billing/billing-config', () => ({
      getBillingConfig: async () => ({
        markup: 4.5,
        creditUnitUsd: 0.01,
        enforcementEnabled: false,
        autoTopupEnabled: true,
        lowBalanceThresholds: [200, 50],
      }),
    }))

    const { recordCreditDebit } = await import('@/lib/billing/credit-ledger')

    await recordCreditDebit({
      companyId: COMPANY,
      operationType: 'estimate',
      realCostUsd: 0.02, // 0.02 * 4.5 / 0.01 = 9 credits debited -> balanceAfter = 91
      attemptId: 'wiring-test-1',
    })

    expect(triggerMock).toHaveBeenCalledTimes(1)
    expect(triggerMock).toHaveBeenCalledWith({ companyId: COMPANY, newBalance: 91 })

    vi.doUnmock('@/lib/billing/auto-topup')
    vi.doUnmock('@/lib/notifications/dispatch')
    vi.doUnmock('@/lib/notifications/copy')
    vi.doUnmock('@/lib/supabase/service')
    vi.doUnmock('@/lib/billing/billing-config')
    vi.resetModules()
  })
})
