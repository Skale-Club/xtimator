import 'server-only'
import { getBillingConfig } from '@/lib/billing/billing-config'
import type { EstimatedCreditOp } from '@/lib/billing/estimated-credit-ops'

/**
 * SEED-055 Phase D: the credits an operation is expected to cost, for the
 * pre-gate only (`checkCredits` / `assertCanCreate`). Read from
 * billing_config.estimatedCreditsByOp (default 1 per op). Never throws: any
 * read problem resolves to 1, the historical hard-coded value.
 */
export async function getEstimatedCredits(op: EstimatedCreditOp): Promise<number> {
  try {
    const cfg = await getBillingConfig()
    const n = cfg?.estimatedCreditsByOp?.[op]
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 1
  } catch {
    return 1
  }
}
