import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Phase 142 (ANN-02) — THE LOAD-BEARING no-double-grant regression.
 *
 * Proves the company-month key (`grant:{companyId}:{YYYY-MM}`) is the SINGLE
 * dedup authority across BOTH grant paths: the invoice.paid webhook grant AND
 * the monthly-credit-grant cron. When both run in the SAME calendar month for
 * the SAME company against a shared ledger that enforces
 * UNIQUE(company_id, idempotency_key), EXACTLY ONE grant row exists — the
 * second source is a no-op. Order-independent (webhook→cron and cron→webhook).
 *
 * This is the retrocompat proof: a MONTHLY subscriber is granted exactly once
 * per month with NO double-grant when both the webhook and the cron fire.
 *
 * Strategy: run the REAL `grantCredits` (NOT mocked) against an in-memory
 * credit_ledger fake wired into requireServiceClient, so grantCredits' real
 * check-then-insert dedup (`.eq('idempotency_key', key).maybeSingle()` →
 * short-circuit) genuinely runs. The cron and the webhook both call grantCredits
 * with monthGrantKey(company, now) — the IDENTICAL key — so the second insert
 * is skipped.
 *
 * No real secrets / no DB / no network — placeholder ids only (co_1).
 */

// ------------------------------------------------------------------
// In-memory credit_ledger + companies, behind a chainable supabase fake that
// reproduces the subset of the query surface grantCredits uses:
//   from('credit_ledger').select('id').eq('company_id',x).eq('idempotency_key',k).limit(1).maybeSingle()
//   from('credit_ledger').insert(row)            // rejects UNIQUE(company_id, idempotency_key) with 23505
//   from('companies').select('credit_balance').eq('id',x).single()
//   from('companies').update({credit_balance}).eq('id',x)
// ------------------------------------------------------------------
type LedgerRow = {
  id: string
  company_id: string
  idempotency_key: string | null
  delta_credits: number
}

const { ledger, companyBalance } = vi.hoisted(() => ({
  ledger: [] as LedgerRow[],
  companyBalance: { value: 0 },
}))

function makeServiceFake() {
  return {
    from(table: string) {
      if (table === 'credit_ledger') {
        return {
          // SELECT id WHERE company_id = .. AND idempotency_key = ..
          select() {
            const filters: Record<string, unknown> = {}
            const api = {
              eq(col: string, val: unknown) {
                filters[col] = val
                return api
              },
              limit() {
                return api
              },
              async maybeSingle() {
                const hit = ledger.find(
                  (r) =>
                    r.company_id === filters.company_id &&
                    r.idempotency_key === filters.idempotency_key,
                )
                return { data: hit ? { id: hit.id } : null, error: null }
              },
            }
            return api
          },
          // INSERT — enforce UNIQUE(company_id, idempotency_key) → 23505.
          async insert(row: Omit<LedgerRow, 'id'>) {
            const dup =
              row.idempotency_key != null &&
              ledger.some(
                (r) =>
                  r.company_id === row.company_id &&
                  r.idempotency_key === row.idempotency_key,
              )
            if (dup) {
              return { error: { code: '23505', message: 'duplicate key' } }
            }
            ledger.push({ id: `led_${ledger.length + 1}`, ...row })
            return { error: null }
          },
        }
      }
      // companies
      return {
        select() {
          return {
            eq() {
              return {
                async single() {
                  return {
                    data: { credit_balance: companyBalance.value },
                    error: null,
                  }
                },
              }
            },
          }
        },
        update(patch: { credit_balance: number }) {
          return {
            async eq() {
              companyBalance.value = patch.credit_balance
              return { error: null }
            },
          }
        },
      }
    },
  }
}

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(() => makeServiceFake()),
}))

// REAL grantCredits + REAL monthGrantKey — this is the whole point.
const { grantCredits, monthGrantKey } = await import('@/lib/billing/credit-ledger')

const COMPANY = 'co_1'
const GRANT = 9000 // pro tier monthlyCreditGrant

/** Simulate the invoice.paid webhook grant (route.ts invoice.paid arm). */
async function webhookGrant(now: Date) {
  await grantCredits({
    companyId: COMPANY,
    credits: GRANT,
    reason: 'grant',
    refId: 'in_test',
    idempotencyKey: monthGrantKey(COMPANY, now),
  })
}

/** Simulate one cron grant for the same company (runMonthlyCreditGrant inner). */
async function cronGrant(now: Date) {
  await grantCredits({
    companyId: COMPANY,
    credits: GRANT,
    reason: 'grant',
    refId: null,
    idempotencyKey: monthGrantKey(COMPANY, now),
  })
}

describe('LOAD-BEARING — no double-grant per company-month (Phase 142 ANN-02)', () => {
  beforeEach(() => {
    ledger.length = 0
    companyBalance.value = 0
    vi.clearAllMocks()
  })

  it('webhook THEN cron in the same month → EXACTLY ONE ledger grant row', async () => {
    const now = new Date('2026-06-15T05:00:00Z')
    await webhookGrant(now)
    await cronGrant(now)

    expect(ledger).toHaveLength(1)
    expect(ledger[0].company_id).toBe(COMPANY)
    expect(ledger[0].idempotency_key).toBe('grant:co_1:2026-06')
    expect(ledger[0].delta_credits).toBe(GRANT)
    // Balance bumped once, not twice.
    expect(companyBalance.value).toBe(GRANT)
  })

  it('cron THEN webhook in the same month → EXACTLY ONE ledger grant row (order-independent)', async () => {
    const now = new Date('2026-06-15T05:00:00Z')
    await cronGrant(now)
    await webhookGrant(now)

    expect(ledger).toHaveLength(1)
    expect(ledger[0].idempotency_key).toBe('grant:co_1:2026-06')
    expect(companyBalance.value).toBe(GRANT)
  })

  it('a DIFFERENT month grants again (annual sub: cron grants months 2-12)', async () => {
    await webhookGrant(new Date('2026-06-01T05:00:00Z')) // month 1 (invoice.paid)
    await cronGrant(new Date('2026-07-01T05:00:00Z')) // month 2 (cron)
    await cronGrant(new Date('2026-08-01T05:00:00Z')) // month 3 (cron)

    expect(ledger).toHaveLength(3)
    expect(ledger.map((r) => r.idempotency_key)).toEqual([
      'grant:co_1:2026-06',
      'grant:co_1:2026-07',
      'grant:co_1:2026-08',
    ])
    expect(companyBalance.value).toBe(GRANT * 3)
  })
})
