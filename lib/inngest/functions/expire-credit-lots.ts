/**
 * SEED-055 Phase B — hourly credit-lot expiry sweep.
 *
 * Credits live in lots (table credit_lots) and a lot may carry an expires_at.
 * Nothing flips on its own at the deadline, so this job calls the
 * expire_credit_lots RPC every hour: it writes an `expire` ledger row per lapsed
 * lot, zeroes the lot and refreshes each affected company's cached
 * credit_balance. Until Phase C every lot is created with expires_at = NULL, so
 * the sweep finds nothing and this is a cheap no-op.
 *
 * Structure mirrors monthly-credit-grant.ts: a pure, testable runner
 * (`runExpireCreditLots`) plus a thin Inngest wrapper. The sweep is safe to
 * re-run (a swept lot has remaining = 0) so retries are harmless.
 *
 * expireCreditLots never throws: on an RPC failure it raises its own ops alert
 * and resolves to 0, and the next hourly run simply tries again.
 */
import { inngest } from '@/lib/inngest/client'
import { expireCreditLots } from '@/lib/billing/credit-ledger'

export interface ExpireCreditLotsResult {
  /** Number of lots whose remaining credits were expired by this run. */
  expired: number
}

export async function runExpireCreditLots(): Promise<ExpireCreditLotsResult> {
  const expired = await expireCreditLots()
  return { expired }
}

export const expireCreditLotsJob = inngest.createFunction(
  {
    id: 'expire-credit-lots',
    triggers: [{ cron: '0 * * * *' }],
    retries: 3,
  },
  async ({ step }) => {
    return step.run('expire-credit-lots', async () => runExpireCreditLots())
  },
)
