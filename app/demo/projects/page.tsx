import { createServiceClient } from '@/lib/supabase/service'
import { getDemoCompanyId } from '@/lib/demo/config'
import { getProjects } from '@/lib/queries/dashboard'
import { PageHeading } from '@/components/app-shell/page-heading'
import { formatMoney } from '@/lib/money/currency'

export const dynamic = 'force-dynamic'

function prettyStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default async function DemoProjectsPage() {
  const supabase = createServiceClient()
  if (!supabase) {
    return <p className="p-6 text-sm text-muted-foreground">Demo is not configured.</p>
  }

  const companyId = getDemoCompanyId()
  const projects = await getProjects(supabase, companyId)

  return (
    <div className="space-y-6 p-6">
      <PageHeading>Projects</PageHeading>
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
                    {formatMoney(p.total, p.currency_code ?? 'USD')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
