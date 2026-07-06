import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 112-03 — credit-ledger metering core (CREDIT-02/03/04/05/06/07).
 *
 * Locks the contract of lib/billing/credit-ledger.ts BEFORE/ALONGSIDE its
 * implementation (Task 2 GREEN):
 *   - CREDIT-02: recordCreditDebit math = round(real_cost × markup / creditUnitUsd).
 *   - CREDIT-07: a null real cost (or a cost rounding to 0 credits) → NO debit;
 *                a service-client failure NEVER throws (best-effort, console.warn).
 *   - CREDIT-06: idempotent debits — check-then-insert dedup + 23505 swallow;
 *                debitIdemKey('a1','estimate') === 'a1:debit:estimate'.
 *   - CREDIT-03: each write reads + updates companies.credit_balance;
 *                reconcileBalance recomputes SUM(delta_credits).
 *   - CREDIT-04: grantCredits writes a POSITIVE grant row + bumps balance.
 *   - CREDIT-05: checkCredits returns {allowed,balance,shortfall}; allowed:true
 *                ALWAYS when enforcementEnabled:false, gated when true.
 *
 * The service client + billing-config reader are mocked. NO DB, NO network,
 * NO secrets — pure unit tests over the never-throw helper shape.
 */

// ---- service-client mock (requireServiceClient) -----------------------------
// A single mutable holder lets each test install a chainable fake whose reads
// are programmable and whose writes (insert/update) are captured for assertions.
let serviceClientImpl: () => unknown = () => makeServiceClient()

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => serviceClientImpl(),
}))

// ---- billing-config mock (getBillingConfig) ---------------------------------
let billingConfig: {
  markup: number
  creditUnitUsd: number
  enforcementEnabled: boolean
} = { markup: 4.5, creditUnitUsd: 0.01, enforcementEnabled: false }

vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: async () => billingConfig,
}))

// ---- chainable supabase fake ------------------------------------------------
// Records every insert/update payload. Programmable per-table read results:
//   reads.ledgerExisting  -> the dedup .maybeSingle() row (or null = no dup)
//   reads.companyBalance  -> the companies.credit_balance .single() value
//   reads.ledgerRows      -> the reconcile SELECT delta_credits rows
//   insertError           -> { code } returned by .insert()
type Captured = {
  inserts: Array<{ table: string; payload: Record<string, unknown> }>
  updates: Array<{ table: string; payload: Record<string, unknown> }>
}

let captured: Captured = { inserts: [], updates: [] }
let reads: {
  ledgerExisting: { id: string } | null
  companyBalance: number | null
  ledgerRows: Array<{ delta_credits: number }>
} = { ledgerExisting: null, companyBalance: 0, ledgerRows: [] }
let insertError: { code?: string; message?: string } | null = null
let insertThrows = false

function makeServiceClient() {
  return {
    from(table: string) {
      return {
        // SELECT chain: .select(cols) -> chainable terminating in
        // .single() (balance / reconcile) or .maybeSingle() (dedup).
        select(cols: string) {
          const chain = {
            _table: table,
            _cols: cols,
            eq() {
              return chain
            },
            limit() {
              return chain
            },
            async maybeSingle() {
              // dedup existence check on credit_ledger
              return { data: reads.ledgerExisting, error: null }
            },
            async single() {
              // companies.credit_balance read
              return {
                data:
                  reads.companyBalance === null
                    ? null
                    : { credit_balance: reads.companyBalance },
                error: null,
              }
            },
            // reconcile: select('delta_credits').eq() then awaited as a promise
            then(resolve: (v: unknown) => void) {
              resolve({ data: reads.ledgerRows, error: null })
            },
          }
          return chain
        },
        insert(payload: Record<string, unknown>) {
          if (insertThrows) throw new Error('insert exploded')
          captured.inserts.push({ table, payload })
          return Promise.resolve({ error: insertError })
        },
        update(payload: Record<string, unknown>) {
          captured.updates.push({ table, payload })
          return {
            eq() {
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
  }
}

// ---- import under test (after the mocks) ------------------------------------
import {
  recordCreditDebit,
  grantCredits,
  checkCredits,
  reconcileBalance,
  debitIdemKey,
} from '@/lib/billing/credit-ledger'

const COMPANY = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  captured = { inserts: [], updates: [] }
  reads = { ledgerExisting: null, companyBalance: 0, ledgerRows: [] }
  insertError = null
  insertThrows = false
  billingConfig = { markup: 4.5, creditUnitUsd: 0.01, enforcementEnabled: false }
  serviceClientImpl = () => makeServiceClient()
})

// =============================================================================
// CREDIT-06 — debitIdemKey shape
// =============================================================================
describe('CREDIT-06: debitIdemKey', () => {
  it("builds `${attemptId}:debit:${op}`", () => {
    expect(debitIdemKey('a1', 'estimate')).toBe('a1:debit:estimate')
    expect(debitIdemKey('xyz', 'photo_batch')).toBe('xyz:debit:photo_batch')
  })
})

// =============================================================================
// CREDIT-02 — debit math
// =============================================================================
describe('CREDIT-02: recordCreditDebit math', () => {
  it('debits round(real_cost × markup / creditUnitUsd) as a NEGATIVE delta', async () => {
    reads.companyBalance = 0
    await recordCreditDebit({
      companyId: COMPANY,
      operationType: 'estimate',
      realCostUsd: 0.02, // 0.02 * 4.5 / 0.01 = 9
      attemptId: 'a1',
    })
    expect(captured.inserts).toHaveLength(1)
    const row = captured.inserts[0].payload
    expect(captured.inserts[0].table).toBe('credit_ledger')
    expect(row.delta_credits).toBe(-9)
    expect(row.reason).toBe('debit')
    expect(row.operation_type).toBe('estimate')
    expect(row.markup).toBe(4.5)
    expect(row.real_cost_usd).toBe(0.02)
    expect(row.idempotency_key).toBe('a1:debit:estimate')
    expect(row.ref_id).toBe('a1')
  })

  it('writes balance_after = current - credits AND updates companies.credit_balance', async () => {
    reads.companyBalance = 100
    await recordCreditDebit({
      companyId: COMPANY,
      operationType: 'estimate',
      realCostUsd: 0.02,
      attemptId: 'a1',
    })
    const row = captured.inserts[0].payload
    expect(row.balance_after).toBe(91) // 100 - 9
    expect(captured.updates).toHaveLength(1)
    expect(captured.updates[0].table).toBe('companies')
    expect(captured.updates[0].payload.credit_balance).toBe(91)
  })
})

// =============================================================================
// CREDIT-07 — zero/null cost → no debit; never-throw
// =============================================================================
describe('CREDIT-07: zero-debit + never-throw', () => {
  it('null real cost → NO debit (no insert, no `?? 0`)', async () => {
    await recordCreditDebit({
      companyId: COMPANY,
      operationType: 'estimate',
      realCostUsd: null,
      attemptId: 'a1',
    })
    expect(captured.inserts).toHaveLength(0)
    expect(captured.updates).toHaveLength(0)
  })

  it('a cost that rounds to 0 credits → NO debit', async () => {
    // 0.000001 * 4.5 / 0.01 = 0.00045 -> round = 0
    await recordCreditDebit({
      companyId: COMPANY,
      operationType: 'estimate',
      realCostUsd: 0.000001,
      attemptId: 'a1',
    })
    expect(captured.inserts).toHaveLength(0)
  })

  it('NEVER throws when the service client insert rejects — logs a warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    insertThrows = true
    await expect(
      recordCreditDebit({
        companyId: COMPANY,
        operationType: 'estimate',
        realCostUsd: 0.02,
        attemptId: 'a1',
      })
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

// =============================================================================
// CREDIT-06 — idempotency
// =============================================================================
describe('CREDIT-06: idempotent debits', () => {
  it('pre-insert existence check returns a row → does NOT insert again', async () => {
    reads.ledgerExisting = { id: 'existing-row' }
    await recordCreditDebit({
      companyId: COMPANY,
      operationType: 'estimate',
      realCostUsd: 0.02,
      attemptId: 'a1',
    })
    expect(captured.inserts).toHaveLength(0)
    expect(captured.updates).toHaveLength(0)
  })

  it('a 23505 unique-violation on insert is swallowed (no throw)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    insertError = { code: '23505', message: 'duplicate key' }
    await expect(
      recordCreditDebit({
        companyId: COMPANY,
        operationType: 'estimate',
        realCostUsd: 0.02,
        attemptId: 'a1',
      })
    ).resolves.toBeUndefined()
    // 23505 is the dedup working — it is NOT a failure, so no warn.
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

// =============================================================================
// CREDIT-03 — reconcileBalance
// =============================================================================
describe('CREDIT-03: reconcileBalance', () => {
  it('sums delta_credits from credit_ledger and writes the sum into companies.credit_balance', async () => {
    reads.ledgerRows = [
      { delta_credits: 9000 },
      { delta_credits: -9 },
      { delta_credits: -50 },
    ]
    const sum = await reconcileBalance(COMPANY)
    expect(sum).toBe(8941)
    expect(captured.updates).toHaveLength(1)
    expect(captured.updates[0].table).toBe('companies')
    expect(captured.updates[0].payload.credit_balance).toBe(8941)
  })

  it('empty ledger → 0', async () => {
    reads.ledgerRows = []
    const sum = await reconcileBalance(COMPANY)
    expect(sum).toBe(0)
    expect(captured.updates[0].payload.credit_balance).toBe(0)
  })
})

// =============================================================================
// CREDIT-04 — grantCredits
// =============================================================================
describe('CREDIT-04: grantCredits', () => {
  it('inserts a POSITIVE grant row and bumps credit_balance by the granted amount', async () => {
    reads.companyBalance = 0
    await grantCredits({
      companyId: COMPANY,
      credits: 9000,
      reason: 'grant',
      refId: 'evt_1',
      idempotencyKey: 'evt_1:grant:pro',
    })
    expect(captured.inserts).toHaveLength(1)
    const row = captured.inserts[0].payload
    expect(row.delta_credits).toBe(9000)
    expect(row.reason).toBe('grant')
    expect(row.balance_after).toBe(9000)
    expect(row.idempotency_key).toBe('evt_1:grant:pro')
    expect(row.ref_id).toBe('evt_1')
    expect(captured.updates[0].payload.credit_balance).toBe(9000)
  })

  it('a duplicate idempotencyKey (existing row) is a no-op', async () => {
    reads.ledgerExisting = { id: 'existing-grant' }
    await grantCredits({
      companyId: COMPANY,
      credits: 9000,
      reason: 'grant',
      refId: 'evt_1',
      idempotencyKey: 'evt_1:grant:pro',
    })
    expect(captured.inserts).toHaveLength(0)
    expect(captured.updates).toHaveLength(0)
  })

  it('never throws on insert failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    insertThrows = true
    await expect(
      grantCredits({ companyId: COMPANY, credits: 9000, reason: 'grant' })
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

// =============================================================================
// CREDIT-05 — checkCredits enforcement gate
// =============================================================================
describe('CREDIT-05: checkCredits', () => {
  // checkCredits takes an INJECTED supabase client (mirror checkQuota).
  function injectedClient(balance: number | null) {
    return {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  async single() {
                    return {
                      data:
                        balance === null ? null : { credit_balance: balance },
                      error: null,
                    }
                  },
                }
              },
            }
          },
        }
      },
    }
  }

  it('enforcementEnabled:false → allowed:true ALWAYS (shortfall still reported)', async () => {
    billingConfig.enforcementEnabled = false
    const res = await checkCredits(injectedClient(10) as never, COMPANY, 999999)
    expect(res.allowed).toBe(true)
    expect(res.balance).toBe(10)
    expect(res.shortfall).toBe(999999 - 10)
  })

  it('enforcementEnabled:true + balance < estimated → allowed:false, shortfall>0', async () => {
    billingConfig.enforcementEnabled = true
    const res = await checkCredits(injectedClient(5) as never, COMPANY, 100)
    expect(res.allowed).toBe(false)
    expect(res.balance).toBe(5)
    expect(res.shortfall).toBe(95)
  })

  it('enforcementEnabled:true + balance >= estimated → allowed:true, shortfall:0', async () => {
    billingConfig.enforcementEnabled = true
    const res = await checkCredits(injectedClient(500) as never, COMPANY, 100)
    expect(res.allowed).toBe(true)
    expect(res.balance).toBe(500)
    expect(res.shortfall).toBe(0)
  })

  it('null balance defaults to 0', async () => {
    billingConfig.enforcementEnabled = true
    const res = await checkCredits(injectedClient(null) as never, COMPANY, 100)
    expect(res.balance).toBe(0)
    expect(res.shortfall).toBe(100)
    expect(res.allowed).toBe(false)
  })

  // Billing v2 (BYOK): a company on its OWN OpenRouter key is never gated by
  // platform credits — even at zero balance with enforcement ON.
  it('byok_enabled:true → allowed:true even at zero balance under enforcement', async () => {
    billingConfig.enforcementEnabled = true
    const byokClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  async single() {
                    return {
                      data: { credit_balance: 0, byok_enabled: true },
                      error: null,
                    }
                  },
                }
              },
            }
          },
        }
      },
    }
    const res = await checkCredits(byokClient as never, COMPANY, 100)
    expect(res.allowed).toBe(true)
    expect(res.shortfall).toBe(0)
  })
})
