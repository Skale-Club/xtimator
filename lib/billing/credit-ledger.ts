import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireServiceClient } from '@/lib/supabase/service'
import { getBillingConfig } from '@/lib/billing/billing-config'

/**
 * Phase 112 — Credit Ledger metering CORE (CREDIT-02/03/04/05/06/07).
 *
 * Converts the real AI cost captured in Phase 110 into a credit debit, grants
 * credits, reads/checks the fast cached balance, and reconciles the cache to
 * the append-only ledger. Composed entirely from existing repo primitives:
 *   - never-throw best-effort write shape  → mirrors lib/billing/record-ai-cost.ts
 *   - check-then-insert + 23505 swallow    → mirrors lib/quota.ts recordUsage
 *   - runtime billing params               → lib/billing/billing-config.ts (Phase 111)
 *
 * WHY THIS FILE EXISTS (and NOT record-ai-cost.ts): the Phase-110 measure-only
 * CI guard (tests/unit/billing/measure-only-invariant.test.ts) fails the build
 * if the tokens credit/debit/ledger/balance/markup — or any charging import —
 * appear in lib/billing/record-ai-cost.ts. The debit therefore deliberately
 * lives here, fired from the call sites, leaving the cost-capture module
 * measure-only. This module is the FIRST real consumer of getBillingConfig
 * (the Phase-111 dormancy guard allowlists it).
 *
 * Enforcement is OFF by default (billing_config.enforcementEnabled === false):
 * debits RECORD but checkCredits NEVER blocks until Phase 116 calibration.
 *
 * null vs 0 discipline: a null/absent realCostUsd produces NO debit (never
 * `?? 0`). CREDIT-07 (MCP conversation = zero credit) holds BY CONSTRUCTION —
 * there is no channel branch; an op that spent nothing simply records nothing.
 */

/** Postgres unique_violation — the partial-unique idempotency index already has this row. */
const PG_UNIQUE_VIOLATION = '23505'

export type DebitOperationType =
  | 'estimate'
  | 'photo_batch'
  | 'audio_minutes'
  | 'price_research'

/** Idempotency key for a debit: `${attemptId}:debit:${op}` (retry-stable per attempt+op). */
export function debitIdemKey(attemptId: string, op: string): string {
  return `${attemptId}:debit:${op}`
}

/**
 * Record a credit debit for one AI operation. Best-effort, idempotent, never
 * throws. credits = round(realCostUsd × markup / creditUnitUsd); a null cost
 * or a cost rounding to ≤0 credits is a no-op (no row). Reads the cached
 * companies.credit_balance, writes the ledger row, and updates the cache in
 * the same service-role write.
 */
export async function recordCreditDebit(input: {
  companyId: string
  operationType: DebitOperationType
  realCostUsd: number | null
  attemptId: string
}): Promise<void> {
  try {
    // null cost → no debit (NEVER guess; null-vs-0 discipline from Phase 110).
    if (input.realCostUsd == null) return

    const cfg = await getBillingConfig()
    const credits = Math.round((input.realCostUsd * cfg.markup) / cfg.creditUnitUsd)
    if (credits <= 0) return

    const svc = requireServiceClient()
    const key = debitIdemKey(input.attemptId, input.operationType)

    // Dedup: a retried debit with the same key is a no-op (mirror recordUsage;
    // do NOT use .upsert(onConflict) — supabase-js can't supply the partial
    // index predicate as an arbiter).
    const { data: existing } = await svc
      .from('credit_ledger')
      .select('id')
      .eq('company_id', input.companyId)
      .eq('idempotency_key', key)
      .limit(1)
      .maybeSingle()
    if (existing) return

    // Read the cached balance, compute balance_after (debit = negative delta).
    const { data: co } = await svc
      .from('companies')
      .select('credit_balance')
      .eq('id', input.companyId)
      .single()
    const current = (co as { credit_balance?: number } | null)?.credit_balance ?? 0
    const balanceAfter = current - credits

    const { error } = await svc.from('credit_ledger').insert({
      company_id: input.companyId,
      delta_credits: -credits,
      reason: 'debit',
      operation_type: input.operationType,
      ref_id: input.attemptId,
      real_cost_usd: input.realCostUsd,
      markup: cfg.markup,
      balance_after: balanceAfter,
      idempotency_key: key,
    })
    // A concurrent retry won the insert race — the partial unique index rejected
    // the duplicate. That is the dedup working, not a failure.
    if (error && (error as { code?: string }).code !== PG_UNIQUE_VIOLATION) {
      throw new Error(`recordCreditDebit insert failed: ${(error as { message?: string }).message}`)
    }

    await svc
      .from('companies')
      .update({ credit_balance: balanceAfter })
      .eq('id', input.companyId)
  } catch (err) {
    // Best-effort: a ledger-write failure must NEVER break generation.
    console.warn('[recordCreditDebit] swallowed write failure:', err)
  }
}

/**
 * Grant (or top-up) credits — a POSITIVE delta row + balance bump. Best-effort,
 * idempotent, never throws. Ships DORMANT this phase: Phase 113's invoice.paid
 * webhook is the first caller. Dedup by idempotencyKey when provided.
 */
export async function grantCredits(input: {
  companyId: string
  credits: number
  reason: 'grant' | 'topup'
  refId?: string | null
  idempotencyKey?: string | null
}): Promise<void> {
  try {
    if (!(input.credits > 0)) return
    const svc = requireServiceClient()

    // Dedup by idempotencyKey if one is supplied (mirror recordCreditDebit).
    if (input.idempotencyKey) {
      const { data: existing } = await svc
        .from('credit_ledger')
        .select('id')
        .eq('company_id', input.companyId)
        .eq('idempotency_key', input.idempotencyKey)
        .limit(1)
        .maybeSingle()
      if (existing) return
    }

    const { data: co } = await svc
      .from('companies')
      .select('credit_balance')
      .eq('id', input.companyId)
      .single()
    const current = (co as { credit_balance?: number } | null)?.credit_balance ?? 0
    const balanceAfter = current + input.credits

    const { error } = await svc.from('credit_ledger').insert({
      company_id: input.companyId,
      delta_credits: input.credits,
      reason: input.reason,
      operation_type: null,
      ref_id: input.refId ?? null,
      real_cost_usd: null,
      markup: null,
      balance_after: balanceAfter,
      idempotency_key: input.idempotencyKey ?? null,
    })
    if (error && (error as { code?: string }).code !== PG_UNIQUE_VIOLATION) {
      throw new Error(`grantCredits insert failed: ${(error as { message?: string }).message}`)
    }

    await svc
      .from('companies')
      .update({ credit_balance: balanceAfter })
      .eq('id', input.companyId)
  } catch (err) {
    console.warn('[grantCredits] swallowed write failure:', err)
  }
}

/**
 * Pre-op balance gate (CREDIT-05). Reads the cached companies.credit_balance via
 * the INJECTED client (mirror checkQuota in lib/quota.ts) and reports
 * {allowed, balance, shortfall}. When enforcementEnabled is FALSE (the entire
 * pre-calibration period), allowed is ALWAYS true — debits record but nothing
 * blocks. Phase 116 flips the flag after deriving real numbers.
 */
export async function checkCredits(
  supabase: SupabaseClient,
  companyId: string,
  estimatedCredits = 0
): Promise<{ allowed: boolean; balance: number; shortfall: number }> {
  const { data } = await supabase
    .from('companies')
    .select('credit_balance')
    .eq('id', companyId)
    .single()
  const balance = (data as { credit_balance?: number } | null)?.credit_balance ?? 0
  const shortfall = Math.max(0, estimatedCredits - balance)

  const cfg = await getBillingConfig()
  if (!cfg.enforcementEnabled) {
    // Measure-only: never block (still report shortfall for UI).
    return { allowed: true, balance, shortfall }
  }
  return { allowed: shortfall === 0, balance, shortfall }
}

/**
 * Repair the cached balance from the source-of-truth ledger (CREDIT-03):
 * SUM(delta_credits) → companies.credit_balance. Best-effort, never throws;
 * returns the computed sum (0 on failure or empty ledger). Summed TS-side for
 * symmetry/testability with the rest of the module.
 */
export async function reconcileBalance(companyId: string): Promise<number> {
  try {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('credit_ledger')
      .select('delta_credits')
      .eq('company_id', companyId)
    const rows = (data as Array<{ delta_credits?: number }> | null) ?? []
    const sum = rows.reduce((acc, r) => acc + (r.delta_credits ?? 0), 0)

    await svc.from('companies').update({ credit_balance: sum }).eq('id', companyId)
    return sum
  } catch (err) {
    console.warn('[reconcileBalance] swallowed write failure:', err)
    return 0
  }
}
