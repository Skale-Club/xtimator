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
 * stripe_subscription_id IS NOT NULL — exactly how the webhook lifecycle leaves
 * the row (no separate subscription-status column exists; do NOT add one).
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

type ServiceClientLike = ReturnType<typeof requireServiceClient>

export interface MonthlyCreditGrantResult {
  granted: number
}

export async function runMonthlyCreditGrant(
  svc: ServiceClientLike,
): Promise<MonthlyCreditGrantResult> {
  // Per-tier grant numbers read ONCE for the whole run.
  const cfg = await getBillingConfig()

  // Active paying companies: paid tier + a present subscription id. Mirrors
  // cleanup-audio's `.not(col,'is',null)` filter style.
  const { data, error } = await svc
    .from('companies')
    .select('id, tier')
    .in('tier', ['pro', 'business'])
    .not('stripe_subscription_id', 'is', null)

  if (error) {
    console.warn('[monthly-credit-grant] select failed:', error.message)
    return { granted: 0 }
  }

  const companies =
    (data ?? []) as Array<{ id: string; tier: string | null }>
  const now = new Date()

  let granted = 0
  for (const company of companies) {
    // Defensive per-company try/catch: grantCredits already swallows its own
    // errors, but a bad tier lookup here must not abort the loop.
    try {
      const tier = (company.tier ?? 'free') as BillingTier
      const credits = cfg.tiers[tier]?.monthlyCreditGrant ?? 0
      // grantCredits no-ops on credits <= 0 and on an already-present key —
      // that already-present-key case IS the cron-no-ops-when-the-webhook-
      // granted behavior, by construction (the shared company-month key).
      await grantCredits({
        companyId: company.id,
        credits,
        reason: 'grant',
        refId: null,
        idempotencyKey: monthGrantKey(company.id, now),
      })
      granted += 1
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[monthly-credit-grant] grant failed for', company.id, msg)
    }
  }

  return { granted }
}

export const monthlyCreditGrantJob = inngest.createFunction(
  {
    id: 'monthly-credit-grant',
    triggers: [{ cron: '0 5 1 * *' }],
  },
  async ({ step }) => {
    return step.run('grant-monthly-credits', async () => {
      const svc = requireServiceClient()
      return runMonthlyCreditGrant(svc)
    })
  },
)
