import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireServiceClient } from '@/lib/supabase/service'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'

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

    // Phase 115 (CREDITUI-02): best-effort low-balance heads-up. `void` so a
    // notification delay never blocks the debit return; the helper is itself
    // self-guarded (never throws). cfg is already in scope (read above). No
    // userId in this scope — pass null (notify tolerates it, like quota).
    void notifyLowCreditBalance({
      companyId: input.companyId,
      userId: null,
      previousBalance: current,
      newBalance: balanceAfter,
      thresholds: cfg.lowBalanceThresholds,
    })
  } catch (err) {
    // Best-effort: a ledger-write failure must NEVER break generation.
    console.warn('[recordCreditDebit] swallowed write failure:', err)
  }
}

/** UTC month key `YYYY-MM` for per-month dedupe (local copy of the lib/quota.ts
 * helper — kept local to avoid coupling credit-ledger to the quota module). */
function monthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Phase 142 (ANN-02) — the SINGLE company-month idempotency key shared by
 * the invoice.paid webhook grant AND the monthly-credit-grant cron, so a
 * company is granted its monthlyCreditGrant AT MOST ONCE per calendar month
 * for any billing interval. UTC so it never drifts across timezones.
 * Format: `grant:{companyId}:{YYYY-MM}`.
 */
export function monthGrantKey(companyId: string, date: Date = new Date()): string {
  const ym = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  return `grant:${companyId}:${ym}`
}

/**
 * Phase 115 (CREDITUI-02) — best-effort low-balance notification, mirroring
 * `notifyQuotaThresholds` (lib/quota.ts). Fires only on a DOWNWARD crossing of a
 * configured threshold, deduped per company + threshold + month so the owner is
 * pinged at most once per threshold per billing month.
 *
 * Reuses the EXISTING billing-category events (`quota.exhausted` for the zero
 * state, `quota.80pct` for a low non-zero crossing) — no new EventType.
 *
 * Copy is INFORMATIONAL only: this milestone runs with enforcement OFF, so the
 * notification is a heads-up + top-up/upgrade nudge — never enforcement language
 * (the account keeps working; this is a reminder, not a wall).
 *
 * Never throws (best-effort) — a notification failure must never break the
 * credit debit write that triggered it.
 */
export async function notifyLowCreditBalance(params: {
  companyId: string
  userId?: string | null
  previousBalance: number
  newBalance: number
  thresholds: number[]
}): Promise<void> {
  const { companyId, userId, previousBalance, newBalance, thresholds } = params
  const month = monthKey()

  try {
    // Zero / exhausted state takes precedence over any low-threshold crossing.
    if (previousBalance > 0 && newBalance <= 0) {
      const copy = buildNotificationCopy('quota.exhausted', {})
      void notify({
        companyId,
        userId: userId ?? null,
        eventType: 'quota.exhausted',
        title: copy.title,
        body: copy.body,
        linkUrl: '/settings/billing',
        channels: { inApp: true, email: true },
        metadata: { dedupe_key: `credit-zero-${companyId}-${month}` },
      })
      return
    }

    // Low (non-zero) crossing — fire at most ONCE, for the highest threshold the
    // balance crossed downward on this debit.
    const sorted = [...thresholds].sort((a, b) => b - a)
    const crossed = sorted.find(
      (t) => t > 0 && previousBalance > t && newBalance <= t
    )
    if (crossed === undefined) return

    const copy = buildNotificationCopy('quota.80pct', { quotaPercent: 0 })
    void notify({
      companyId,
      userId: userId ?? null,
      eventType: 'quota.80pct',
      title: copy.title,
      body: copy.body,
      linkUrl: '/settings/billing',
      metadata: { dedupe_key: `credit-low-${companyId}-${crossed}-${month}` },
    })
  } catch {
    /* best-effort — never throws (a notify failure must not break the debit). */
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
  // Required (no default): with a silent `0` the shortfall is always 0, so an
  // enforcement-ON gate would pass regardless of balance. A gate caller must
  // pass the op's real estimated cost; an affordance-only read passes 0 on
  // purpose (see app/api/generate-estimate/route.ts).
  estimatedCredits: number
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
