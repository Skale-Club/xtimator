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
  auto_topup_pack_price_cents?: number | null
  auto_topup_pack_credits?: number | null
  stripe_customer_id?: string | null
} | null = null

const updates: Array<{ table: string; payload: Record<string, unknown> }> = []

// Configurable per-test: what apply_credit_ledger_entry (grantCredits' RPC)
// resolves to. Defaults to a landed grant — tests that need to prove the
// "charged but not granted" alert override this to { applied: false }.
let ledgerRpcApplied = true

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    rpc: async (fn: string) => {
      if (fn === 'apply_credit_ledger_entry') {
        return { data: [{ balance_after: 1300, applied: ledgerRpcApplied }], error: null }
      }
      return { data: true, error: null } // lock acquire/release always granted in this file's tests
    },
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

// ---- ops-alert mock -----------------------------------------------------------
const mockNotifyOps = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/observability/ops-alert', () => ({
  notifyOps: (...args: unknown[]) => mockNotifyOps(...args),
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
  ledgerRpcApplied = true
  mockNotifyOps.mockClear()
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
// FIX 1 (HIGH): a declined/failed charge must fire notifyOps('auto_topup_charge_failed'),
// and the logged/alerted payload must NEVER carry the raw Stripe error object
// (which, for a card error, embeds `payment_intent`/`raw` — card brand, last4,
// decline code). Only err.code / err.message / the PaymentIntent id survive.
// =============================================================================
describe('FIX 1 (HIGH): auto_topup_charge_failed alert + sanitized logging', () => {
  it('fires notifyOps("auto_topup_charge_failed") with severity error on a declined charge', async () => {
    paymentIntentsCreate.mockRejectedValueOnce(
      Object.assign(new Error('Your card was declined.'), {
        code: 'card_declined',
        payment_intent: { id: 'pi_declined', last4: '4242', raw: { decline_code: 'generic_decline' } },
      })
    )

    await triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 })

    expect(mockNotifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'auto_topup_charge_failed',
        severity: 'error',
        message: expect.stringContaining(COMPANY),
      })
    )
  })

  it('never logs or alerts the raw error object — only code/message/paymentIntentId survive (no payment_intent/raw fields)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    paymentIntentsCreate.mockRejectedValueOnce(
      Object.assign(new Error('Your card was declined.'), {
        code: 'card_declined',
        payment_intent: {
          id: 'pi_declined',
          last4: '4242',
          brand: 'visa',
          raw: { decline_code: 'generic_decline', card: { last4: '4242' } },
        },
      })
    )

    await triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 })

    // console.warn payload: assert no nested payment_intent/raw object leaked.
    const warnCall = warn.mock.calls.find((c) => String(c[0]).includes('off-session charge failed'))
    expect(warnCall).toBeDefined()
    const loggedPayload = warnCall?.[1]
    expect(loggedPayload).not.toHaveProperty('payment_intent')
    expect(loggedPayload).not.toHaveProperty('raw')
    expect(JSON.stringify(loggedPayload)).not.toContain('4242')
    expect(JSON.stringify(loggedPayload)).not.toContain('visa')
    expect(loggedPayload).toMatchObject({ code: 'card_declined', paymentIntentId: 'pi_declined' })

    // notifyOps message: same sanitization requirement — no card details/raw object.
    const alertCall = mockNotifyOps.mock.calls.find(
      (c) => (c[0] as { kind?: string })?.kind === 'auto_topup_charge_failed'
    )
    expect(alertCall).toBeDefined()
    const alertMessage = (alertCall?.[0] as { message: string }).message
    expect(alertMessage).not.toContain('4242')
    expect(alertMessage).not.toContain('visa')
    expect(alertMessage).toContain('pi_declined')

    warn.mockRestore()
  })
})

// =============================================================================
// Pre-launch audit follow-up: grantCredits' return value now proves whether
// credits actually landed — a resolved promise alone is not proof (grantCredits
// is itself never-throw and no-ops on an existing idempotency key).
// =============================================================================
describe('FIX 1 (HIGH): verifying the grant landed before clearing the failure flag', () => {
  it('clears auto_topup_last_failed_at when grantCredits reports applied:true', async () => {
    ledgerRpcApplied = true
    await triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 })

    const clearUpdate = updates.find(
      (u) => u.table === 'companies' && u.payload.auto_topup_last_failed_at === null
    )
    expect(clearUpdate).toBeDefined()
    expect(mockNotifyOps).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'auto_topup_charged_without_grant' })
    )
  })

  it('does NOT clear auto_topup_last_failed_at and fires auto_topup_charged_without_grant when the card was charged but the grant did not apply', async () => {
    ledgerRpcApplied = false
    await triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 })

    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1)
    const clearUpdate = updates.find(
      (u) => u.table === 'companies' && u.payload.auto_topup_last_failed_at === null
    )
    expect(clearUpdate).toBeUndefined()
    expect(mockNotifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'auto_topup_charged_without_grant',
        severity: 'error',
        message: expect.stringContaining(COMPANY),
      })
    )
  })
})

// =============================================================================
// Pack snapshot: the company must be charged/granted what it authorized at save
// time, independent of any later admin reorder/reprice of billing_config packs.
// =============================================================================
describe('CREDITUI-07: pack snapshot (charge what was authorized)', () => {
  it('charges the per-company snapshot price/credits over the config pack when both are present', async () => {
    // Snapshot says $50 / 3500 credits; the live config pack at index 0 is a
    // DIFFERENT $20 / 1300 — the charge must use the snapshot, not the config.
    companyRow = {
      auto_topup_enabled: true,
      auto_topup_threshold_credits: 100,
      auto_topup_pack_index: 0,
      auto_topup_pack_price_cents: 5000,
      auto_topup_pack_credits: 3500,
      stripe_customer_id: 'cus_test',
    }
    billingConfig = {
      autoTopupEnabled: true,
      topUpPacks: [{ credits: 1300, priceCents: 2000 }],
    }

    await triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 })

    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1)
    expect(paymentIntentsCreate.mock.calls[0][0]).toMatchObject({ amount: 5000 })
    expect(paymentIntentsCreate.mock.calls[0][0].metadata).toMatchObject({ credits: '3500' })
  })

  it('falls back to the config pack (index lookup) when the snapshot is absent (legacy row)', async () => {
    // No snapshot columns — legacy company. Charge resolves from config index 0.
    companyRow = {
      auto_topup_enabled: true,
      auto_topup_threshold_credits: 100,
      auto_topup_pack_index: 0,
      auto_topup_pack_price_cents: null,
      auto_topup_pack_credits: null,
      stripe_customer_id: 'cus_test',
    }
    billingConfig = {
      autoTopupEnabled: true,
      topUpPacks: [{ credits: 1300, priceCents: 2000 }],
    }

    await triggerAutoTopupIfNeeded({ companyId: COMPANY, newBalance: 50 })

    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1)
    expect(paymentIntentsCreate.mock.calls[0][0]).toMatchObject({ amount: 2000 })
    expect(paymentIntentsCreate.mock.calls[0][0].metadata).toMatchObject({ credits: '1300' })
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
        // Simulates apply_credit_ledger_entry — recordCreditDebit's write path.
        async rpc(fnName: string, params: Record<string, unknown>) {
          if (fnName !== 'apply_credit_ledger_entry') {
            throw new Error(`unexpected rpc call: ${fnName}`)
          }
          const balanceAfter = 100 + (params.p_delta_credits as number) // current balance = 100
          ledgerCaptured.push({ table: 'credit_ledger', payload: params })
          return { data: [{ balance_after: balanceAfter, applied: true }], error: null }
        },
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
