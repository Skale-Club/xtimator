import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { aggregateAiCostByOperation } from '@/lib/billing/calibration'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { BillingTable } from './billing-table'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

export const dynamic = 'force-dynamic'

export default async function AdminBillingPage() {
  await requireAdmin()
  const svc = requireServiceClient()

  const [billingConfig, platformStats, { data: companies }] = await Promise.all([
    getBillingConfig(),
    aggregateAiCostByOperation(),
    svc
      .from('companies')
      .select('id, name, tier, tier_trial_ends_at, stripe_subscription_id, tier_renews_at, credit_balance, auto_topup_enabled')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const totalRealCostUsd = platformStats.reduce((acc, op) => acc + op.meanUsd * op.n, 0)
  const totalCreditsEquivalent =
    billingConfig.creditUnitUsd > 0
      ? Math.round((totalRealCostUsd * billingConfig.markup) / billingConfig.creditUnitUsd)
      : 0

  // Batched per-company real-cost lookup — avoids an N+1 getCompanyCostOverview
  // call per row (up to 200 rows). Single query over ai_cost_events scoped to
  // the fetched company IDs, then grouped client-side.
  const companyIds = (companies ?? []).map((c) => c.id as string)
  const { data: costRows } =
    companyIds.length > 0
      ? await svc
          .from('ai_cost_events')
          .select('company_id, real_cost_usd')
          .in('company_id', companyIds)
          .not('real_cost_usd', 'is', null)
      : { data: [] as { company_id: string; real_cost_usd: number }[] }
  const costByCompany = new Map<string, number>()
  for (const row of costRows ?? []) {
    const prev = costByCompany.get(row.company_id) ?? 0
    costByCompany.set(row.company_id, prev + (row.real_cost_usd ?? 0))
  }

  const companiesWithCost = (companies ?? []).map((c) => ({
    ...c,
    realCostUsd: costByCompany.get(c.id as string) ?? 0,
  }))

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight"><T>Billing</T></h1>
          <p className="text-muted-foreground">
            <T>Monitor real AI cost, credit balances, and auto-top-up status per company.</T>
          </p>
        </div>

        {/* Platform AI cost stat card with gradient top edge */}
        <Card variant="stat" className="p-6 flex flex-col gap-3 w-full md:w-auto md:min-w-[240px] md:shrink-0">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <T>Platform AI Cost</T>
          </span>
          <p className="font-mono text-3xl font-semibold tracking-tight">
            ${totalRealCostUsd.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground">
            {totalCreditsEquivalent.toLocaleString()} <T>credits equivalent at</T> {billingConfig.markup}× <T>markup</T>
          </p>
        </Card>
      </div>

      <Card variant="glass" className="p-4 md:p-6">
        <BillingTable
          companies={companiesWithCost}
          markup={billingConfig.markup}
          creditUnitUsd={billingConfig.creditUnitUsd}
        />
      </Card>
    </div>
  )
}
