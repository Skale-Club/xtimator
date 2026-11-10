import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 2b - recordMessagingDebit (lib/billing/credit-ledger.ts): the aggregated
 * messaging debit. Same formula as recordCreditDebit (round once over the batch),
 * but a BYOK company is NOT skipped (messaging is not AI) and the outcome is
 * reported so the debit job can settle or release its claim.
 */

vi.mock('@/lib/observability/ops-alert', () => ({
  notifyOps: vi.fn().mockResolvedValue(undefined),
}))

let byok = false
const rpc = vi.fn()

function makeClient() {
  return {
    rpc: (...args: unknown[]) => rpc(...args),
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: table === 'companies' ? { byok_enabled: byok } : null, error: null }
                },
                async single() {
                  return { data: table === 'companies' ? { credit_balance: 500 } : null, error: null }
                },
              }
            },
          }
        },
      }
    },
  }
}

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => makeClient(),
}))

let billingConfig: {
  markup: number
  creditUnitUsd: number
  enforcementEnabled: boolean
  lowBalanceThresholds: number[]
  meteredOperations?: Record<string, boolean>
} = { markup: 4.5, creditUnitUsd: 0.01, enforcementEnabled: false, lowBalanceThresholds: [] }

vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: async () => billingConfig,
}))

import { recordMessagingDebit, recordCreditDebit } from '@/lib/billing/credit-ledger'

beforeEach(() => {
  byok = false
  billingConfig = { markup: 4.5, creditUnitUsd: 0.01, enforcementEnabled: false, lowBalanceThresholds: [] }
  rpc.mockReset()
  rpc.mockResolvedValue({ data: [{ balance_after: 400, applied: true }], error: null })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('recordMessagingDebit', () => {
  it('debits round(sum x markup / creditUnitUsd) ONCE for the whole batch, under the messaging op', async () => {
    // 0.0204 USD x 4.5 / 0.01 = 9.18 -> 9 credits (each message alone would round to 0 or 4)
    const outcome = await recordMessagingDebit({ companyId: 'co-1', realCostUsd: 0.0204, batchId: 'batch-1' })
    expect(outcome).toBe('debited')
    expect(rpc).toHaveBeenCalledTimes(1)
    const [fn, params] = rpc.mock.calls[0]
    expect(fn).toBe('consume_credits')
    expect(params).toMatchObject({
      p_company_id: 'co-1',
      p_credits: 9,
      p_operation_type: 'messaging',
      p_ref_id: 'messaging:co-1:batch-1',
      p_real_cost_usd: 0.0204,
      p_idempotency_key: 'messaging:co-1:batch-1:debit:messaging',
    })
  })

  it('a batch that rounds to 0 credits is reported as below_minimum and writes nothing', async () => {
    const outcome = await recordMessagingDebit({ companyId: 'co-1', realCostUsd: 0.0004, batchId: 'b' }) // 0.18 credits
    expect(outcome).toBe('below_minimum')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('still debits a BYOK company (messaging is not AI) while recordCreditDebit skips it', async () => {
    byok = true
    expect(await recordMessagingDebit({ companyId: 'co-1', realCostUsd: 0.0204, batchId: 'b' })).toBe('debited')
    expect(rpc).toHaveBeenCalledTimes(1)

    rpc.mockClear()
    await recordCreditDebit({ companyId: 'co-1', operationType: 'estimate', realCostUsd: 0.0204, attemptId: 'a1' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('a repeated batch is an idempotent no-op reported as already_applied', async () => {
    rpc.mockResolvedValue({ data: [{ balance_after: 400, applied: false }], error: null })
    expect(await recordMessagingDebit({ companyId: 'co-1', realCostUsd: 0.0204, batchId: 'b' })).toBe('already_applied')
  })

  it('honours billing_config.meteredOperations.messaging === false (absorbed, not debited)', async () => {
    billingConfig = { ...billingConfig, meteredOperations: { messaging: false } }
    expect(await recordMessagingDebit({ companyId: 'co-1', realCostUsd: 0.0204, batchId: 'b' })).toBe('not_metered')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reports failed (never throws) when the ledger RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(recordMessagingDebit({ companyId: 'co-1', realCostUsd: 0.0204, batchId: 'b' })).resolves.toBe('failed')
  })
})
