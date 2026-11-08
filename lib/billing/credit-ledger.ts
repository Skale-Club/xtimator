import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireServiceClient } from '@/lib/supabase/service'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import { triggerAutoTopupIfNeeded } from '@/lib/billing/auto-topup'
import { notifyOps } from '@/lib/observability/ops-alert'
import { currentMonthlyCreditWindow } from '@/lib/billing/credit-window'
import { isTopupEligible } from '@/lib/billing/topup-eligibility'

/**
 * Best-effort ops alert for a swallowed credit-ledger write failure. Shared by
 * recordCreditDebit / grantCredits / reconcileBalance so a broken RPC (or any
 * other write-path failure) surfaces to ops instead of vanishing into
 * console.warn. Hour-bucketed dedupe key so a persistently broken RPC pages
 * once per company per hour, not once per call.
 */
function notifyCreditLedgerWriteFailed(companyId: string, op: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  void notifyOps({
    kind: 'credit_ledger_write_failed',
    severity: 'error',
    title: 'Credit ledger write failed',
    message: `${companyId} ${op} failed: ${msg}`,
    dedupeKey: `credit_ledger_write_failed:${companyId}:${new Date().toISOString().slice(0, 13)}`,
  })
}

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
  // SEED-055 Phase D wires the chat assistant to a per-turn debit; the ledger
  // CHECK already accepts it (20261106000001). No caller yet.
  | 'chat'

/** Idempotency key for a debit: `${attemptId}:debit:${op}` (retry-stable per attempt+op). */
export function debitIdemKey(attemptId: string, op: string, runKey?: string): string {
  return runKey ? `${attemptId}:debit:${op}:${runKey}` : `${attemptId}:debit:${op}`
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
  /**
   * Optional per-run discriminator for ops that can legitimately run more than
   * once under the SAME attemptId (e.g. a second photo analysis in one capture
   * attempt). Stable across Inngest retries of one run (pass the event's
   * requestId), unique across runs. Absent = the per-attempt key (unchanged).
   */
  runKey?: string
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

    // Phase 3 (3.9): honour billing_config.meteredOperations. An op explicitly
    // switched OFF (=== false) is absorbed, not debited. An op that is simply
    // not listed stays metered: the stored map REPLACES the defaults wholesale
    // (shallow merge in getBillingConfig), so a row saved before an op existed
    // (e.g. 'chat') would otherwise silently stop debiting in production.
    // Empty/absent map = everything metered (previous behavior).
    if (cfg.meteredOperations?.[input.operationType] === false) return

    const key = debitIdemKey(input.attemptId, input.operationType, input.runKey)

    // Atomic RPC (SEED-055 Phase B): locks the company row, drains the credit
    // lots (monthly -> signup -> the rest by soonest expiry; any shortfall goes
    // to credit_debt), writes ONE ledger row with the per-lot split and
    // refreshes credit_balance in a single transaction. `previous` is read only
    // for the low-balance-crossing notification below; it is not used to
    // compute the new balance.
    const previous = await readCachedBalance(svc, input.companyId)
    const { data: rpcData, error: rpcError } = await svc.rpc('consume_credits', {
      p_company_id: input.companyId,
      p_credits: credits,
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
    notifyCreditLedgerWriteFailed(input.companyId, 'recordCreditDebit', err)
  }
}

/** UTC month key `YYYY-MM` for per-month dedupe (local copy of the lib/quota.ts
 * helper — kept local to avoid coupling credit-ledger to the quota module). */
function monthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
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
 * Copy (SEED-055 Phase E): credits are the only wall, so the message says so
 * plainly and carries one CTA - "Subscribe to Pro" for a company that is not a
 * live Pro subscriber, "Buy credits" for one that is (see `creditCtaFor`).
 *
 * Never throws (best-effort) — a notification failure must never break the
 * credit debit write that triggered it.
 */
/**
 * The single CTA the credit alerts push: top-ups are Pro-only (isTopupEligible),
 * so a non-subscriber is told to subscribe and a live subscriber to buy credits.
 * Falls back to the subscribe CTA if the company row cannot be read.
 */
async function creditCtaFor(companyId: string): Promise<string> {
  try {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('companies')
      .select('tier, stripe_subscription_status, stripe_subscription_id')
      .eq('id', companyId)
      .maybeSingle()
    const row = data as {
      tier?: string | null
      stripe_subscription_status?: string | null
      stripe_subscription_id?: string | null
    } | null
    if (row && isTopupEligible(row.tier, row.stripe_subscription_status, row.stripe_subscription_id)) {
      return 'Buy credits'
    }
  } catch {
    /* fall through to the subscribe CTA */
  }
  return 'Subscribe to Pro'
}

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
      const ctx = { creditCta: await creditCtaFor(companyId) }
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
    const ctx = { creditCta: await creditCtaFor(companyId) }
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
/**
 * `applied: true` iff this call newly recorded a ledger row and bumped the
 * balance. `applied: false` covers every non-write outcome — a no-op
 * (credits <= 0), an idempotent replay of an already-recorded key, AND a
 * swallowed failure — callers that need to know "did the credits actually
 * land" (e.g. auto-topup verifying a charge landed credits) must check this
 * flag rather than assuming a resolved promise means success.
 */
export type CreditLotSource = 'signup' | 'monthly' | 'topup' | 'adjust'

export async function grantCredits(input: {
  companyId: string
  credits: number
  reason: 'grant' | 'topup' | 'adjust'
  /** Which kind of lot the credits land in (drives consumption order). */
  source: CreditLotSource
  /** ISO timestamp the lot expires at; null/absent = never expires. */
  expiresAt?: string | null
  /** Billing-period identifier for subscription lots (Phase C). */
  periodKey?: string | null
  refId?: string | null
  idempotencyKey?: string | null
}): Promise<{ applied: boolean }> {
  try {
    if (!(input.credits > 0)) return { applied: false }
    const svc = requireServiceClient()

    // Atomic RPC (SEED-055 Phase B): creates the lot, pays down any credit_debt
    // first, writes the ledger row and refreshes credit_balance in ONE locked
    // transaction. `applied: false` means a concurrent/retried call already
    // recorded this exact idempotencyKey; nothing further to do.
    const { data: rpcData, error: rpcError } = await svc.rpc('grant_credit_lot', {
      p_company_id: input.companyId,
      p_source: input.source,
      p_credits: input.credits,
      p_expires_at: input.expiresAt ?? null,
      p_period_key: input.periodKey ?? null,
      p_ref_id: input.refId ?? null,
      p_idempotency_key: input.idempotencyKey ?? null,
      p_reason: input.reason,
    })
    if (rpcError) {
      throw new Error(`grantCredits RPC failed: ${rpcError.message}`)
    }
    const result = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as
      | { applied?: boolean }
      | undefined
    return { applied: Boolean(result?.applied) }
  } catch (err) {
    console.warn('[grantCredits] swallowed write failure:', err)
    notifyCreditLedgerWriteFailed(input.companyId, 'grantCredits', err)
    return { applied: false }
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

  // Enforcement ON: decide from the SAME resolution assertCanCreate uses, so a
  // lapsed subscriber holding only top-up lots (not spendable) is refused here
  // too. Lazy import: access-state already lazily imports this module for the
  // signup self-heal, so neither side has a module-init cycle.
  try {
    const { resolveSpendable } = await import('@/lib/billing/access-state')
    const r = await resolveSpendable(companyId, estimatedCredits, supabase)
    if (r.exempt) return { allowed: true, balance, shortfall: 0 }
    return { allowed: r.ok, balance: r.balance, shortfall: Math.max(0, estimatedCredits - r.balance) }
  } catch (err) {
    // Fail-open on infrastructure errors (matches access-guard): a broken read
    // must not lock every company out. Debits still record; the ledger and
    // reconcileBalance are the backstop.
    console.warn('[checkCredits] spendable-balance resolution failed, failing open:', err)
    return { allowed: true, balance, shortfall }
  }
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
export async function grantSignupCredits(companyId: string): Promise<{ applied: boolean }> {
  const cfg = await getBillingConfig()
  return grantCredits({
    companyId,
    credits: cfg.signupCreditGrant,
    reason: 'grant',
    source: 'signup',
    expiresAt: null,
    refId: 'signup',
    idempotencyKey: `signup:${companyId}`,
  })
}

/**
 * SEED-055 Phase C: grant the company's MONTHLY lot for the window containing
 * `now`, derived from `periodEnd` (the end of the Stripe period the subscription
 * is paid through). Monthly sub: the window is the billing period. Annual sub:
 * the current monthly anniversary window (see lib/billing/credit-window.ts).
 *
 * Idempotent on `grant:{companyId}:{periodKey}` - the SINGLE dedup authority
 * shared by the invoice.paid arm, the checkout.session.completed arm and the
 * daily cron, so whichever lands first grants and the others no-op. The RPC
 * expires the company's previous monthly lot(s) in the same transaction, but
 * only when this key is new, so a redelivered event never expires the lot it
 * already granted.
 *
 * `credits` is the caller-resolved tier grant (always
 * getBillingConfig().tiers[tier].monthlyCreditGrant). Never throws; returns
 * `applied: true` only when a NEW lot landed. A null window (period lapsed /
 * unpaid), a non-positive grant and an already-granted key resolve to
 * `applied: false`; a swallowed write failure resolves to `applied: false`
 * with `failed: true` so a batch caller (the daily cron) can tell "nothing to
 * do" from "the RPC is broken".
 */
export async function grantMonthlyLot(input: {
  companyId: string
  credits: number
  periodEnd: Date
  now?: Date
  refId?: string | null
}): Promise<{ applied: boolean; failed?: boolean }> {
  try {
    if (!(input.credits > 0)) return { applied: false }
    const window = currentMonthlyCreditWindow(input.periodEnd, input.now ?? new Date())
    if (!window) return { applied: false }

    const svc = requireServiceClient()
    const { data: rpcData, error: rpcError } = await svc.rpc('grant_monthly_lot', {
      p_company_id: input.companyId,
      p_credits: input.credits,
      p_period_key: window.periodKey,
      p_expires_at: window.end.toISOString(),
      p_ref_id: input.refId ?? null,
      p_idempotency_key: `grant:${input.companyId}:${window.periodKey}`,
    })
    if (rpcError) {
      throw new Error(`grantMonthlyLot RPC failed: ${rpcError.message}`)
    }
    const result = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as
      | { applied?: boolean }
      | undefined
    return { applied: Boolean(result?.applied) }
  } catch (err) {
    console.warn('[grantMonthlyLot] swallowed write failure:', err)
    notifyCreditLedgerWriteFailed(input.companyId, 'grantMonthlyLot', err)
    return { applied: false, failed: true }
  }
}

/**
 * SEED-055 Phase C: expire the company's live monthly lot(s) immediately -
 * cancellation / unpaid subscription. Idempotent (a second call finds nothing
 * live). Never throws; returns the number of lots expired (0 on failure).
 */
export async function closeMonthlyLots(
  companyId: string,
  refId: string | null = null,
): Promise<{ expired: number }> {
  try {
    const svc = requireServiceClient()
    const { data: rpcData, error: rpcError } = await svc.rpc('close_monthly_lots', {
      p_company_id: companyId,
      p_ref_id: refId,
    })
    if (rpcError) {
      throw new Error(`closeMonthlyLots RPC failed: ${rpcError.message}`)
    }
    const result = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as
      | { expired?: number }
      | undefined
    return { expired: Number(result?.expired ?? 0) || 0 }
  } catch (err) {
    console.warn('[closeMonthlyLots] swallowed write failure:', err)
    notifyCreditLedgerWriteFailed(companyId, 'closeMonthlyLots', err)
    return { expired: 0 }
  }
}

/**
 * Repair the cached balance from the credit lots (SEED-055 Phase B invariant):
 *   credit_balance = SUM(remaining of non-expired lots) - credit_debt
 * Best-effort, never throws; returns the computed balance (0 on failure).
 * Summed TS-side for symmetry/testability with the rest of the module.
 */
export async function reconcileBalance(companyId: string): Promise<number> {
  try {
    const svc = requireServiceClient()
    const [lotsRes, companyRes] = await Promise.all([
      svc
        .from('credit_lots')
        .select('remaining, expires_at')
        .eq('company_id', companyId),
      svc.from('companies').select('credit_debt').eq('id', companyId).maybeSingle(),
    ])
    const lots =
      (lotsRes.data as Array<{ remaining?: number; expires_at?: string | null }> | null) ?? []
    const debt = (companyRes.data as { credit_debt?: number } | null)?.credit_debt ?? 0
    const now = Date.now()
    const live = lots.reduce((acc, l) => {
      const expired = l.expires_at != null && new Date(l.expires_at).getTime() <= now
      return expired ? acc : acc + (l.remaining ?? 0)
    }, 0)
    const balance = live - debt

    await svc.from('companies').update({ credit_balance: balance }).eq('id', companyId)
    return balance
  } catch (err) {
    console.warn('[reconcileBalance] swallowed write failure:', err)
    notifyCreditLedgerWriteFailed(companyId, 'reconcileBalance', err)
    return 0
  }
}

/**
 * Sweep credit lots past their expiry (SEED-055 Phase B): calls the
 * expire_credit_lots RPC, which writes an `expire` ledger row per lapsed lot,
 * zeroes it and refreshes each affected company's cached balance. Returns the
 * number of lots expired. Never throws — a failure raises an ops alert and
 * resolves to 0 (the hourly cron simply tries again).
 */
export async function expireCreditLots(): Promise<number> {
  try {
    const svc = requireServiceClient()
    const { data, error } = await svc.rpc('expire_credit_lots')
    if (error) {
      throw new Error(`expireCreditLots RPC failed: ${error.message}`)
    }
    const n = Array.isArray(data) ? data[0] : data
    return typeof n === 'number' ? n : Number(n ?? 0) || 0
  } catch (err) {
    console.warn('[expireCreditLots] swallowed failure:', err)
    notifyCreditLedgerWriteFailed('*', 'expireCreditLots', err)
    return 0
  }
}
