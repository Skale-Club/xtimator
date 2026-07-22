import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireServiceClient } from '@/lib/supabase/service'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import { triggerAutoTopupIfNeeded } from '@/lib/billing/auto-topup'

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
/**
 * Billing v2 (BYOK): true when the company runs on its OWN OpenRouter key.
 * BYOK companies pay their own AI bill, so platform credits neither debit nor
 * gate them. Central helper so every billing touchpoint shares one definition.
 * Never throws — a read failure resolves to false (bill normally).
 */
async function isByokCompany(
  supabase: SupabaseClient,
  companyId: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('companies')
      .select('byok_enabled')
      .eq('id', companyId)
      .maybeSingle()
    return Boolean((data as { byok_enabled?: boolean | null } | null)?.byok_enabled)
  } catch {
    return false
  }
}

export async function recordCreditDebit(input: {
  companyId: string
  operationType: DebitOperationType
  realCostUsd: number | null
  attemptId: string
}): Promise<void> {
  try {
    // null cost → no debit (NEVER guess; null-vs-0 discipline from Phase 110).
    if (input.realCostUsd == null) return

    const svc = requireServiceClient()

    // Billing v2 (BYOK): the op ran on the company's OWN key — nothing to debit.
    if (await isByokCompany(svc, input.companyId)) return

    const cfg = await getBillingConfig()
    const credits = Math.round((input.realCostUsd * cfg.markup) / cfg.creditUnitUsd)
    if (credits <= 0) return

    const key = debitIdemKey(input.attemptId, input.operationType)

    // Atomic RPC (pre-launch audit fix B3): locks the company row, applies the
    // delta to credit_balance, and inserts the ledger row in ONE transaction —
    // replaces the prior SELECT-then-INSERT-then-UPDATE race. `previous` is
    // read only for the low-balance-crossing notification below; it is not
    // used to compute the new balance.
    const previous = await readCachedBalance(svc, input.companyId)
    const { data: rpcData, error: rpcError } = await svc.rpc('apply_credit_ledger_entry', {
      p_company_id: input.companyId,
      p_delta_credits: -credits,
      p_reason: 'debit',
      p_operation_type: input.operationType,
      p_ref_id: input.attemptId,
      p_real_cost_usd: input.realCostUsd,
      p_markup: cfg.markup,
      p_idempotency_key: key,
    })
    if (rpcError) {
      throw new Error(`recordCreditDebit RPC failed: ${rpcError.message}`)
    }
    const result = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as
      | { balance_after: number; applied: boolean }
      | undefined
    if (!result?.applied) return // idempotent no-op — already recorded by a concurrent/retried call
    const balanceAfter = result.balance_after
    const current = previous

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

    // Phase 153 (CREDITUI-07): best-effort auto-top-up trigger. `void` so a
    // Stripe/DB delay never blocks the debit return; the helper is itself
    // never-throw (fails closed on any lock/charge/DB error).
    void triggerAutoTopupIfNeeded({
      companyId: input.companyId,
      newBalance: balanceAfter,
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
    // Dedupe key shares the quota namespace (`quota-exhausted-…`) so the credit
    // meter and the count meter can never DOUBLE-ping the owner in the same
    // month — whichever fires first wins (they mean the same thing to the user).
    if (previousBalance > 0 && newBalance <= 0) {
      const ctx = {}
      const copy = buildNotificationCopy('quota.exhausted', ctx)
      void notify({
        companyId,
        userId: userId ?? null,
        eventType: 'quota.exhausted',
        title: copy.title,
        body: copy.body,
        copyContext: ctx,
        linkUrl: '/settings/billing',
        channels: { inApp: true, email: true },
        metadata: { dedupe_key: `quota-exhausted-${companyId}-${month}` },
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

    // Same unified namespace as notifyQuotaThresholds' 80% ping (`quota-80-…`):
    // "you're running low" reaches the owner at most once per month regardless
    // of which meter (count or credit) crossed first.
    const ctx = { quotaPercent: 0 }
    const copy = buildNotificationCopy('quota.80pct', ctx)
    void notify({
      companyId,
      userId: userId ?? null,
      eventType: 'quota.80pct',
      title: copy.title,
      body: copy.body,
      copyContext: ctx,
      linkUrl: '/settings/billing',
      metadata: { dedupe_key: `quota-80-${companyId}-${month}` },
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

    // Atomic RPC (pre-launch audit fix B3) — see recordCreditDebit for the race
    // this closes. `applied: false` means a concurrent/retried call already
    // recorded this exact idempotencyKey; nothing further to do.
    const { error: rpcError } = await svc.rpc('apply_credit_ledger_entry', {
      p_company_id: input.companyId,
      p_delta_credits: input.credits,
      p_reason: input.reason,
      p_operation_type: null,
      p_ref_id: input.refId ?? null,
      p_real_cost_usd: null,
      p_markup: null,
      p_idempotency_key: input.idempotencyKey ?? null,
    })
    if (rpcError) {
      throw new Error(`grantCredits RPC failed: ${rpcError.message}`)
    }
  } catch (err) {
    console.warn('[grantCredits] swallowed write failure:', err)
  }
}

/** Best-effort read of the cached balance — used only for notification
 * before/after comparisons, never to compute a write. */
async function readCachedBalance(svc: SupabaseClient, companyId: string): Promise<number> {
  const { data } = await svc
    .from('companies')
    .select('credit_balance')
    .eq('id', companyId)
    .single()
  return (data as { credit_balance?: number } | null)?.credit_balance ?? 0
}

/**
 * Pre-op balance gate (CREDIT-05 / Billing v2). Reads the cached
 * companies.credit_balance via the INJECTED client (mirror checkQuota in
 * lib/quota.ts) and reports {allowed, balance, shortfall}.
 *
 * Billing v2 semantics:
 *   - Credits are THE customer-facing meter; this gate is the free-tier wall
 *     (signup grant spent → blocked with an upgrade affordance).
 *   - BYOK companies (own OpenRouter key, super-admin flag) are ALWAYS allowed —
 *     they pay their own AI bill, so the platform balance is irrelevant.
 *   - enforcementEnabled=false (admin panel) reverts to record-only: never
 *     block, still report shortfall for UI.
 */
export async function checkCredits(
  supabase: SupabaseClient,
  companyId: string,
  // Required (no default): with a silent `0` the shortfall is always 0, so an
  // enforcement-ON gate would pass regardless of balance. A gate caller passes
  // the op's estimated cost (>= 1 blocks an empty balance); an affordance-only
  // read passes 0 on purpose (see app/api/generate-estimate/route.ts).
  estimatedCredits: number
): Promise<{ allowed: boolean; balance: number; shortfall: number }> {
  const { data } = await supabase
    .from('companies')
    .select('credit_balance, byok_enabled')
    .eq('id', companyId)
    .single()
  const row = data as { credit_balance?: number; byok_enabled?: boolean | null } | null
  const balance = row?.credit_balance ?? 0
  const shortfall = Math.max(0, estimatedCredits - balance)

  // Billing v2 (BYOK): own key → never gated by platform credits.
  if (row?.byok_enabled) {
    return { allowed: true, balance, shortfall: 0 }
  }

  const cfg = await getBillingConfig()
  if (!cfg.enforcementEnabled) {
    // Record-only mode: never block (still report shortfall for UI).
    return { allowed: true, balance, shortfall }
  }
  return { allowed: shortfall === 0, balance, shortfall }
}

/**
 * Billing v2: the free tier's entire allowance — a ONE-TIME signup credit grant
 * for a company's FIRST-company signup ("the free tier IS the trial": no clock,
 * just this balance). Idempotent via the ledger key `signup:{companyId}` so a
 * retried signup action can never double-grant. Grant size lives in
 * billing_config.signupCreditGrant (runtime-tunable, no deploy).
 *
 * Never throws (grantCredits is itself never-throw) — a grant failure must not
 * break onboarding; the backstop is support re-running the grant.
 */
export async function grantSignupCredits(companyId: string): Promise<void> {
  const cfg = await getBillingConfig()
  await grantCredits({
    companyId,
    credits: cfg.signupCreditGrant,
    reason: 'grant',
    refId: 'signup',
    idempotencyKey: `signup:${companyId}`,
  })
}

/**
 * Billing v2: grant a company its tier's CURRENT-MONTH credit allowance, keyed
 * on the SHARED company-month key (monthGrantKey) — the same dedup authority the
 * monthly cron and the invoice.paid webhook use, so whoever grants first wins
 * and the month is never double-granted. Reads the authoritative grant size from
 * billing_config at grant time (BILLCFG-03: no hard-coded numbers at call sites).
 * Used when an added company inherits a paid tier and must not sit at zero
 * balance until the next cron run. Never throws.
 */
export async function grantMonthlyCredits(
  companyId: string,
  tier: string,
  refId = 'month-grant'
): Promise<void> {
  const cfg = await getBillingConfig()
  const grant =
    cfg.tiers[tier as keyof typeof cfg.tiers]?.monthlyCreditGrant ?? 0
  await grantCredits({
    companyId,
    credits: grant, // grantCredits no-ops on <= 0 (free tier = 0)
    reason: 'grant',
    refId,
    idempotencyKey: monthGrantKey(companyId),
  })
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
