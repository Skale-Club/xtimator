import { createServiceClient } from '@/lib/supabase/service'
import { getDemoCompanyId } from '@/lib/demo/config'
import { getDashboardStats, getProjects } from '@/lib/queries/dashboard'
import { StatCards } from '@/components/dashboard/stat-cards'
import { PageHeading } from '@/components/app-shell/page-heading'
import { formatMoney } from '@/lib/money/currency'

// Always render fresh demo data; never statically cache.
export const dynamic = 'force-dynamic'

function prettyStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default async function DemoDashboardPage() {
  const supabase = createServiceClient()
  if (!supabase) {
    return <p className="p-6 text-sm text-muted-foreground">Demo is not configured.</p>
  }

  const companyId = getDemoCompanyId()
  const { data: company } = await supabase
    .from('companies')
    .select('name, owner_name, currency_code')
    .eq('id', companyId)
    .single()

  const currency = (company?.currency_code as string) ?? 'USD'
  const firstName =
    ((company?.owner_name as string | null) ?? '').split(' ')[0] ||
    (company?.name as string | null) ||
    'there'

  const [stats, projects] = await Promise.all([
    getDashboardStats(supabase, companyId),
    getProjects(supabase, companyId),
  ])

  return (
    <div className="space-y-8 pb-8">
      <section className="px-6 pt-4">
        <PageHeading>Dashboard</PageHeading>
        <p className="mt-2 text-3xl font-semibold tracking-tight">Welcome back, {firstName}</p>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Track active projects, monitor estimate health, and start new work.
        </p>
      </section>

      <StatCards stats={stats} currencyCode={currency} />

      <section className="px-6">
        <h2 className="mb-4 text-2xl font-semibold tracking-tight">Recent projects</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No projects yet.
                  </td>
                </tr>
              ) : (
                projects.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.client?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{prettyStatus(p.status)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(p.total, p.currency_code ?? currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
