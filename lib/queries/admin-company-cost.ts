import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { aggregateAiCostByOperation, type OpCostStat } from '@/lib/billing/calibration'

/**
 * Phase 152 (CREDITUI-05) — admin-only, per-company cost visibility.
 *
 * The DELIBERATE OPPOSITE of getCreditOverview() (lib/queries/credits.ts):
 * that function's cardinal rule is the OWNER-SAFE PROJECTION (never selects
 * real_cost_usd/markup/balance_after). This function's whole purpose is a
 * super-admin-only view that DOES need those figures — kept in a separate
 * file specifically so the tenant-facing neutrality test (Plan 01,
 * tenant-cost-neutrality.test.ts) can assert lib/queries/credits.ts and
 * components/billing/** never reference these columns, without this file's
 * necessary use of them causing a collision. Never import this file from
 * any file under components/billing/ or from any tenant-facing route.
 */
export interface CompanyCostOverview {
  creditBalance: number
  totalRealCostUsd: number
  markup: number
  perOperation: OpCostStat[]
}

export async function getCompanyCostOverview(
  companyId: string,
  markup: number
): Promise<CompanyCostOverview> {
  const svc = requireServiceClient()
  const [companyRes, perOperation] = await Promise.all([
    svc.from('companies').select('credit_balance').eq('id', companyId).single(),
    aggregateAiCostByOperation(companyId),
  ])
  const creditBalance = (companyRes.data as { credit_balance?: number } | null)?.credit_balance ?? 0
  // meanUsd * n reconstructs the exact sum (mean = sum/n)
  const totalRealCostUsd = perOperation.reduce((acc, op) => acc + op.meanUsd * op.n, 0)
  return { creditBalance, totalRealCostUsd, markup, perOperation }
}
