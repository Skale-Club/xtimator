/**
 * SEED-055 Phase C — daily monthly-credit-lot grant cron.
 *
 * Pro grants credits as a MONTHLY lot that lives for one monthly window and is
 * replaced by the next one (use-it-or-lose-it). Which job grants when:
 *   - Monthly sub: invoice.paid (subscription_create / subscription_cycle) and
 *     checkout.session.completed grant the lot of the billing period. This cron
 *     is only an idempotent backstop (a missed/failed webhook self-heals within
 *     a day).
 *   - Annual sub: invoice.paid grants only the FIRST monthly lot. Months 2-12
 *     have no Stripe event at all, so THIS cron is load-bearing: once a day it
 *     calls grantMonthlyLot for every active sub; on the day a monthly
 *     anniversary starts, the window (and therefore the
 *     `grant:{companyId}:{periodKey}` key) changes, a new lot lands and the
 *     previous one expires.
 *
 * Every grant is idempotent on `grant:{companyId}:{periodKey}` (periodKey = the
 * window start, see lib/billing/credit-window.ts), shared with the webhook arms,
 * so running daily, twice a day or after a webhook all converge on exactly one
 * lot per window.
 *
 * "Active paying company" === tier IN ('pro','business') AND
 * stripe_subscription_id IS NOT NULL AND stripe_subscription_status IS NULL or
 * IN ('active','trialing') AND tier_renews_at > now(). The status filter keeps
 * `IS NULL` for rows written before the column existed (NULL = unknown, not
 * inactive). `tier_renews_at > now()` is the payment guard: the window is derived
 * from tier_renews_at (the period the customer has PAID through), so an unpaid
 * renewal - whose invoice.paid never arrives and whose tier_renews_at therefore
 * stays in the past - can never be granted a free month.
 *
 * Implementation notes (mirrors cleanup-audio.ts):
 *   - The grant logic lives in the pure helper `runMonthlyCreditGrant(svc)` so
 *     it's testable without the Inngest harness.
 *   - getBillingConfig() is read ONCE per run; the amount is always
 *     tiers[tier].monthlyCreditGrant.
 *   - A whole-query failure THROWS so Inngest retries instead of silently
 *     skipping a day.
 *   - The ops alert fires only when every attempt FAILED (broken RPC). An
 *     already-granted no-op is the expected steady state and is NOT a failure.
 */
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { grantMonthlyLot } from '@/lib/billing/credit-ledger'
import {
  getBillingConfig,
  type BillingTier,
} from '@/lib/billing/billing-config'
import { notifyOps } from '@/lib/observability/ops-alert'

type ServiceClientLike = ReturnType<typeof requireServiceClient>

export interface MonthlyCreditGrantResult {
  /** Number of active paying companies the run attempted to grant. */
  attempted: number
  /** Number of companies for which a NEW monthly lot ACTUALLY landed. Most days
   * this is 0 (every lot already granted) - that is normal. */
  granted: number
  /** Number of companies whose grant FAILED (RPC / write error). */
  failed: number
}

export async function runMonthlyCreditGrant(
  svc: ServiceClientLike,
): Promise<MonthlyCreditGrantResult> {
  // Per-tier grant numbers read ONCE for the whole run.
  const cfg = await getBillingConfig()
  const now = new Date()

  const { data, error } = await svc
    .from('companies')
    .select('id, tier, tier_renews_at')
    .in('tier', ['pro', 'business'])
    .not('stripe_subscription_id', 'is', null)
    .or('stripe_subscription_status.is.null,stripe_subscription_status.in.(active,trialing)')
    .gt('tier_renews_at', now.toISOString())

  if (error) {
    // THROW (not return zeros) - a swallowed SELECT error would silently skip a
    // day with zero visibility. Inngest retries a function that throws out of
    // step.run per its `retries` config.
    console.warn('[monthly-credit-grant] select failed:', error.message)
    throw new Error(`[monthly-credit-grant] select failed: ${error.message}`)
  }

  const companies = (data ?? []) as Array<{
    id: string
    tier: string | null
    tier_renews_at: string | null
  }>

  let attempted = 0
  let granted = 0
  let failed = 0
  for (const company of companies) {
    attempted += 1
    // Defensive per-company try/catch: grantMonthlyLot already swallows its own
    // errors, but a bad tier lookup / date here must not abort the loop.
    try {
      if (!company.tier_renews_at) continue
      const tier = (company.tier ?? 'free') as BillingTier
      const credits = cfg.tiers[tier]?.monthlyCreditGrant ?? 0
      const result = await grantMonthlyLot({
        companyId: company.id,
        credits, // grantMonthlyLot no-ops on <= 0
        periodEnd: new Date(company.tier_renews_at),
        now,
        refId: 'cron',
      })
      if (result.applied) granted += 1
      else if (result.failed) failed += 1
    } catch (err) {
      failed += 1
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[monthly-credit-grant] grant failed for', company.id, msg)
    }
  }

  // Every attempt FAILED (not "nothing to grant"): something is systemically
  // broken, e.g. a dead RPC or an unapplied migration.
  if (attempted > 0 && failed === attempted) {
    void notifyOps({
      kind: 'monthly_credit_grant_zero_success',
      severity: 'error',
      title: 'Monthly credit grant cron failed for every company',
      message: `attempted=${attempted} failed=${failed} - every company in this run's grant attempt errored`,
      dedupeKey: `monthly_credit_grant_zero_success:${now.toISOString().slice(0, 10)}`,
    })
  }

  return { attempted, granted, failed }
}

export const monthlyCreditGrantJob = inngest.createFunction(
  {
    id: 'monthly-credit-grant',
    triggers: [{ cron: '0 5 * * *' }],
    retries: 3,
  },
  async ({ step }) => {
    return step.run('grant-monthly-credits', async () => {
      const svc = requireServiceClient()
      return runMonthlyCreditGrant(svc)
    })
  },
)
