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

/** Phase 2b: one row of the per-company messaging cost summary (last 30 days). */
export interface MessagingCostSummaryRow {
  channel: 'whatsapp' | 'sms' | 'email'
  count: number
  /** Priced rows only (cost_usd not null), billable or not. */
  usd: number
  /** Part of `usd` that is passed to the customer's credits. */
  billableUsd: number
}

/**
 * Admin-only debug rollup of messaging_cost_events by channel for the last 30
 * days: message count and real USD. Internal tool (super-admin company page),
 * never shown to the tenant. Best-effort: a read failure resolves to [].
 */
export async function getCompanyMessagingCost(companyId: string): Promise<MessagingCostSummaryRow[]> {
  try {
    const svc = requireServiceClient()
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await svc
      .from('messaging_cost_events')
      .select('channel, billable, cost_usd')
      .eq('company_id', companyId)
      .gte('created_at', since)
      .limit(10000)
    const byChannel = new Map<string, MessagingCostSummaryRow>()
    for (const r of (data ?? []) as Array<{ channel: MessagingCostSummaryRow['channel']; billable: boolean; cost_usd: number | string | null }>) {
      const row = byChannel.get(r.channel) ?? { channel: r.channel, count: 0, usd: 0, billableUsd: 0 }
      row.count += 1
      const usd = r.cost_usd == null ? 0 : Number(r.cost_usd)
      if (Number.isFinite(usd)) {
        row.usd += usd
        if (r.billable) row.billableUsd += usd
      }
      byChannel.set(r.channel, row)
    }
    return [...byChannel.values()].sort((a, b) => a.channel.localeCompare(b.channel))
  } catch {
    return []
  }
}
