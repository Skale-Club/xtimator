import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { BillingTable } from './billing-table'

export const dynamic = 'force-dynamic'

export default async function AdminBillingPage() {
  await requireAdmin()
  const svc = requireServiceClient()

  // MRR query: COUNT companies by tier + full company list
  const [{ count: proCount }, { count: bizCount }, { data: companies }] = await Promise.all([
    svc.from('companies').select('id', { count: 'exact', head: true }).eq('tier', 'pro'),
    svc.from('companies').select('id', { count: 'exact', head: true }).eq('tier', 'business'),
    svc
      .from('companies')
      .select('id, name, tier, tier_trial_ends_at, stripe_subscription_id, tier_renews_at')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const mrr = (proCount ?? 0) * 29 + (bizCount ?? 0) * 99

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">
          Manage company tiers, grant credits, and view revenue metrics.
        </p>
      </div>

      {/* MRR metric card */}
      <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-3 max-w-sm">
        <span className="text-sm font-medium text-muted-foreground">Monthly Recurring Revenue</span>
        <p className="text-3xl font-bold tracking-tight">${mrr.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">
          {proCount ?? 0} Pro × $29 + {bizCount ?? 0} Business × $99
        </p>
      </div>

      {/* Company table */}
      <BillingTable companies={companies ?? []} />
    </div>
  )
}
