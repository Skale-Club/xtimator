/**
 * Billing reconciliation cron (pre-launch audit follow-up, FIX 3).
 *
 * Daily at 06:00 UTC — a READ-ONLY health sweep over the billing pipeline.
 * Never repairs anything automatically (drift correction is a human/support
 * decision, not a cron's); it only detects and reports via notifyOps:
 *
 *   (a) credit_balance_drift        — companies.credit_balance disagrees with
 *       SUM(credit_ledger.delta_credits) for that company. This is the
 *       source-of-truth check: the ledger is append-only and authoritative,
 *       credit_balance is a cache (see lib/billing/credit-ledger.ts's own
 *       reconcileBalance, which CAN repair — this cron only detects).
 *   (b) paid_tier_without_subscription — a company on tier IN ('pro','business')
 *       with stripe_subscription_id IS NULL. Mirrors the "active paying
 *       company" definition monthly-credit-grant.ts uses, inverted: this
 *       flags rows that look paid but have no billing rail behind them
 *       (a signup/upgrade race, a webhook that never landed, a bad manual
 *       tier edit).
 *   (c) stale_open_invoices         — invoices.status = 'open' for over 30
 *       days. A healthy invoice moves to 'paid'/'void'/'uncollectible' within
 *       days; a stuck 'open' row usually means the customer never paid and
 *       nobody followed up, or a payment webhook silently failed to land.
 *
 * Implementation notes (mirrors retention-cleanup.ts / monthly-credit-grant.ts):
 *   - Each check lives in its own pure helper so it's independently testable.
 *   - Every check is wrapped so a single check's DB failure never aborts the
 *     others and NEVER throws out of step.run — this cron reports, it does
 *     not gate anything, so best-effort is the right shape (same rationale as
 *     retention-cleanup.ts).
 *   - The drift report caps the company-id list at 10 (MAX_REPORTED_IDS) so a
 *     mass-drift incident doesn't blow up the alert payload — driftCount still
 *     reports the true total.
 */
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { notifyOps } from '@/lib/observability/ops-alert'

type ServiceClientLike = ReturnType<typeof requireServiceClient>

/**
 * PostgREST caps a plain `.select()` at ~1000 rows, so a bare read of
 * `credit_ledger` silently truncates once the ledger grows — and a truncated
 * SUM reports drift for essentially every company. Page explicitly instead.
 */
async function selectAllRows<T>(
  query: { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
  pageSize = 1000,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) return { rows, error: error.message }
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < pageSize) return { rows, error: null }
  }
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const MAX_REPORTED_IDS = 10

export interface BillingReconciliationResult {
  driftCount: number
  driftCompanyIds: string[]
  paidWithoutSubscriptionCount: number
  staleOpenInvoicesCount: number
}

/** Today's UTC date (YYYY-MM-DD) — daily-bucketed dedupe so a persistent
 * drift/backlog pages ops once per day, not once per run if the cron is
 * ever retried or re-triggered manually. */
function dayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * (a) companies.credit_balance vs SUM(credit_ledger.delta_credits). Read-only
 * — reports drifting company ids, never writes a repair (contrast with
 * lib/billing/credit-ledger.ts's reconcileBalance, which is the repair tool
 * a human/support flow calls per-company after seeing this alert).
 */
async function checkCreditBalanceDrift(
  svc: ServiceClientLike,
): Promise<{ driftCount: number; driftCompanyIds: string[] }> {
  try {
    const { rows: companies, error: companiesErr } = await selectAllRows<{
      id: string
      credit_balance: number | null
    }>(svc.from('companies').select('id, credit_balance'))
    if (companiesErr) {
      console.warn('[billing-reconciliation] companies select failed:', companiesErr)
      return { driftCount: 0, driftCompanyIds: [] }
    }

    const { rows: ledgerRows, error: ledgerErr } = await selectAllRows<{
      company_id: string
      delta_credits: number | null
    }>(svc.from('credit_ledger').select('company_id, delta_credits'))
    if (ledgerErr) {
      console.warn('[billing-reconciliation] credit_ledger select failed:', ledgerErr)
      return { driftCount: 0, driftCompanyIds: [] }
    }

    const sums = new Map<string, number>()
    for (const row of (ledgerRows ?? []) as Array<{
      company_id: string
      delta_credits: number | null
    }>) {
      sums.set(row.company_id, (sums.get(row.company_id) ?? 0) + (row.delta_credits ?? 0))
    }

    const drifting: string[] = []
    for (const company of (companies ?? []) as Array<{
      id: string
      credit_balance: number | null
    }>) {
      const expected = sums.get(company.id) ?? 0
      const actual = company.credit_balance ?? 0
      if (expected !== actual) {
        drifting.push(company.id)
      }
    }

    if (drifting.length > 0) {
      void notifyOps({
        kind: 'credit_balance_drift',
        severity: 'error',
        title: 'Credit balance drift detected',
        message: `${drifting.length} companies where companies.credit_balance != SUM(credit_ledger.delta_credits): ${drifting
          .slice(0, MAX_REPORTED_IDS)
          .join(', ')}${drifting.length > MAX_REPORTED_IDS ? ', …' : ''}`,
        dedupeKey: `credit_balance_drift:${dayKey()}`,
      })
    }

    return { driftCount: drifting.length, driftCompanyIds: drifting.slice(0, MAX_REPORTED_IDS) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[billing-reconciliation] credit balance drift check failed:', msg)
    return { driftCount: 0, driftCompanyIds: [] }
  }
}

/** (b) paid tier + no Stripe subscription id — a company that LOOKS paid but
 * has no billing rail behind it. */
async function checkPaidTierWithoutSubscription(svc: ServiceClientLike): Promise<number> {
  try {
    const { data, error } = await svc
      .from('companies')
      .select('id, tier')
      .in('tier', ['pro', 'business'])
      .is('stripe_subscription_id', null)
      // A company that NEVER had a Stripe customer is an admin/support-set
      // tier (the billing page explains that state to the owner) — expected,
      // not drift. Alerting on it would page ops daily for a benign config.
      // The interesting case is a company that DID pay and now has no
      // subscription while keeping paid entitlements.
      .not('stripe_customer_id', 'is', null)

    if (error) {
      console.warn(
        '[billing-reconciliation] paid-tier-without-subscription select failed:',
        error.message,
      )
      return 0
    }

    const rows = (data ?? []) as Array<{ id: string; tier: string | null }>
    if (rows.length > 0) {
      void notifyOps({
        kind: 'paid_tier_without_subscription',
        severity: 'warning',
        title: 'Paid-tier companies without a Stripe subscription',
        message: `${rows.length} companies on a paid tier with stripe_subscription_id IS NULL: ${rows
          .slice(0, MAX_REPORTED_IDS)
          .map((r) => r.id)
          .join(', ')}${rows.length > MAX_REPORTED_IDS ? ', …' : ''}`,
        dedupeKey: `paid_tier_without_subscription:${dayKey()}`,
      })
    }
    return rows.length
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[billing-reconciliation] paid-tier-without-subscription check failed:', msg)
    return 0
  }
}

/** (c) invoices stuck in 'open' for over 30 days. */
async function checkStaleOpenInvoices(svc: ServiceClientLike): Promise<number> {
  try {
    const cutoffIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString()
    const { data, error } = await svc
      .from('invoices')
      .select('id')
      .eq('status', 'open')
      .lt('created_at', cutoffIso)

    if (error) {
      console.warn('[billing-reconciliation] stale-open-invoices select failed:', error.message)
      return 0
    }

    const rows = (data ?? []) as Array<{ id: string }>
    if (rows.length > 0) {
      void notifyOps({
        kind: 'stale_open_invoices',
        severity: 'warning',
        title: 'Stale open invoices (older than 30 days)',
        message: `${rows.length} invoices stuck in status='open' for over 30 days`,
        dedupeKey: `stale_open_invoices:${dayKey()}`,
      })
    }
    return rows.length
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[billing-reconciliation] stale-open-invoices check failed:', msg)
    return 0
  }
}

export async function runBillingReconciliation(
  svc: ServiceClientLike,
): Promise<BillingReconciliationResult> {
  // Each check is independently try/caught (inside its own helper) so one
  // check's DB failure never prevents the others from running.
  const drift = await checkCreditBalanceDrift(svc)
  const paidWithoutSubscriptionCount = await checkPaidTierWithoutSubscription(svc)
  const staleOpenInvoicesCount = await checkStaleOpenInvoices(svc)

  return {
    driftCount: drift.driftCount,
    driftCompanyIds: drift.driftCompanyIds,
    paidWithoutSubscriptionCount,
    staleOpenInvoicesCount,
  }
}

export const billingReconciliationJob = inngest.createFunction(
  {
    id: 'billing-reconciliation',
    triggers: [{ cron: '0 6 * * *' }],
  },
  async ({ step }) => {
    return step.run('reconcile-billing', async () => {
      const svc = requireServiceClient()
      return runBillingReconciliation(svc)
    })
  },
)
