import { createServiceClient } from '@/lib/supabase/service'
import { getDemoCompanyId } from '@/lib/demo/config'
import { getClients } from '@/lib/queries/clients'
import { PageHeading } from '@/components/app-shell/page-heading'

export const dynamic = 'force-dynamic'

export default async function DemoClientsPage() {
  const supabase = createServiceClient()
  if (!supabase) {
    return <p className="p-6 text-sm text-muted-foreground">Demo is not configured.</p>
  }

  const companyId = getDemoCompanyId()
  const clients = await getClients(supabase, companyId)

  return (
    <div className="space-y-6 p-6">
      <PageHeading>Clients</PageHeading>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 text-right font-medium">Projects</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  No clients yet.
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.project_count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
