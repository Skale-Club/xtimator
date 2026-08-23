/**
 * Phase 142 (ANN-02) — Monthly AI-credit grant cron.
 *
 * THE load-bearing job of v4.13 Annual Billing. Decouples the monthly credit
 * grant from the Stripe invoice cadence: at 05:00 UTC on the 1st of every month
 * it grants every ACTIVE PAYING company its tier's `monthlyCreditGrant`, keyed
 * on the SHARED company-month key (`grant:{companyId}:{YYYY-MM}` via
 * monthGrantKey). That key is the SINGLE dedup authority shared with the
 * invoice.paid webhook grant, so a company is granted AT MOST ONCE per calendar
 * month for ANY billing interval:
 *   - Monthly sub → invoice.paid already granted this month → the cron no-ops
 *     (the key is present; grantCredits short-circuits).
 *   - Annual sub → invoice.paid granted month 1 → the cron grants months 2-12.
 *   - New signup → immediate first grant still comes from invoice.paid.
 *
 * "Active paying company" === tier IN ('pro','business') AND
 * stripe_subscription_id IS NOT NULL AND stripe_subscription_status IN
 * ('active','trialing') — exactly how the webhook lifecycle leaves the row.
 * The subscription-status filter is OR'd with `IS NULL` for backward
 * compatibility: rows written before the stripe_subscription_status column
 * existed (migration 20260821000001) have never had it set and must not be
 * silently excluded from the grant — NULL means "unknown / pre-column", not
 * "inactive". A genuinely lapsed subscription reads 'canceled' (or another
 * non-active/trialing status) via customer.subscription.updated/deleted and
 * IS excluded once that status has actually been observed.
 *
 * Implementation notes (mirrors cleanup-audio.ts):
 *   - The grant logic lives in the pure helper `runMonthlyCreditGrant(svc)` so
 *     it's testable without the Inngest harness. The Inngest fn is a thin
 *     wrapper that injects the service-role client.
 *   - getBillingConfig() is read ONCE per run (not per company).
 *   - Best-effort & resilient: each company is granted in a try/catch so one
 *     bad tier lookup never aborts the loop, and a whole-query failure returns
 *     `{ granted: 0 }` rather than throwing out of step.run.
 *   - The grant itself relies on the idempotent never-throw `grantCredits` —
 *     the cron does NOT pre-check whether a company was already granted; the
 *     shared company-month key makes the cron no-op a month the webhook covered.
 *   - Scale note: the company list could grow unbounded; for the current scale
 *     a single select is fine. A future LIMIT/pagination pass is the bounded-set
 *     extension point.
 */
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { grantCredits, monthGrantKey } from '@/lib/billing/credit-ledger'
import {
  getBillingConfig,
  type BillingTier,
} from '@/lib/billing/billing-config'
import { notifyOps } from '@/lib/observability/ops-alert'

type ServiceClientLike = ReturnType<typeof requireServiceClient>

export interface MonthlyCreditGrantResult {
  /** Number of active paying companies the run attempted to grant. */
  attempted: number
  /** Number of companies for which a grant ACTUALLY applied (a new ledger
   * row landed) — grantCredits is never-throw and no-ops on an existing
   * idempotency key, so this is NOT the same as the loop's iteration count. */
  granted: number
}

export async function runMonthlyCreditGrant(
  svc: ServiceClientLike,
): Promise<MonthlyCreditGrantResult> {
  // Per-tier grant numbers read ONCE for the whole run.
  const cfg = await getBillingConfig()

  // Active paying companies: paid tier + a present subscription id + a
  // subscription status that is active/trialing (or unset — see the module
  // doc comment for the backward-compatibility rationale). Mirrors
  // cleanup-audio's `.not(col,'is',null)` filter style for the first two.
  const { data, error } = await svc
    .from('companies')
    .select('id, tier')
    .in('tier', ['pro', 'business'])
    .not('stripe_subscription_id', 'is', null)
    .or('stripe_subscription_status.is.null,stripe_subscription_status.in.(active,trialing)')

  if (error) {
    // THROW (not return {granted:0}) — a swallowed SELECT error previously
    // made the cron silently skip an entire month with zero visibility. An
    // Inngest function that throws out of step.run is retried per the
    // function's `retries` config, giving the RLS/network blip a real chance
    // to clear before the month is genuinely missed.
    console.warn('[monthly-credit-grant] select failed:', error.message)
    throw new Error(`[monthly-credit-grant] select failed: ${error.message}`)
  }

  const companies =
    (data ?? []) as Array<{ id: string; tier: string | null }>
  const now = new Date()

  let attempted = 0
  let granted = 0
  for (const company of companies) {
    attempted += 1
    // Defensive per-company try/catch: grantCredits already swallows its own
    // errors, but a bad tier lookup here must not abort the loop.
    try {
      const tier = (company.tier ?? 'free') as BillingTier
      const credits = cfg.tiers[tier]?.monthlyCreditGrant ?? 0
      // grantCredits no-ops on credits <= 0 and on an already-present key —
      // that already-present-key case IS the cron-no-ops-when-the-webhook-
      // granted behavior, by construction (the shared company-month key).
      // Count a REAL grant only when grantCredits reports applied:true — the
      // loop iterating is NOT proof credits moved (grantCredits is never-throw
      // and silently no-ops on a dup key or a swallowed write failure).
      const result = await grantCredits({
        companyId: company.id,
        credits,
        reason: 'grant',
        refId: null,
        idempotencyKey: monthGrantKey(company.id, now),
      })
      if (result.applied) {
        granted += 1
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[monthly-credit-grant] grant failed for', company.id, msg)
    }
  }

  // Every attempted company failed to grant (0 for 0 — the webhook-already-
  // granted case — is fine and expected some months; > 0 attempted with 0
  // granted means something is systemically broken, e.g. a dead RPC).
  if (attempted > 0 && granted === 0) {
    void notifyOps({
      kind: 'monthly_credit_grant_zero_success',
      severity: 'error',
      title: 'Monthly credit grant cron granted zero companies',
      message: `attempted=${attempted} granted=0 — every company in this run's grant attempt failed`,
      dedupeKey: `monthly_credit_grant_zero_success:${now.toISOString().slice(0, 10)}`,
    })
  }

  return { attempted, granted }
}

export const monthlyCreditGrantJob = inngest.createFunction(
  {
    id: 'monthly-credit-grant',
    triggers: [{ cron: '0 5 1 * *' }],
    retries: 3,
  },
  async ({ step }) => {
    return step.run('grant-monthly-credits', async () => {
      const svc = requireServiceClient()
      return runMonthlyCreditGrant(svc)
    })
  },
)
