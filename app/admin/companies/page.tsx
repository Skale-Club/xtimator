import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { T } from '@/components/i18n/t'

export const dynamic = 'force-dynamic'

type CompanyRow = {
  id: string
  name: string
  tier: string
  ai_model_override: string | null
}

export default async function AdminCompaniesPage() {
  await requireAdmin()

  const svc = requireServiceClient()
  const { data } = await svc
    .from('companies')
    .select('id, name, tier, ai_model_override')
    .order('name', { ascending: true })

  const companies = (data ?? []) as CompanyRow[]
  const overrideCount = companies.filter((c) => !!c.ai_model_override).length

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Companies</T>
        </h1>
        <p className="text-muted-foreground">
          <T>
            All tenants on the platform. Open a company to assign a specific
            AI model (routed via OpenRouter) instead of the platform default.
          </T>
        </p>
        <p className="text-xs text-muted-foreground">
          {overrideCount > 0 ? (
            <>
              {overrideCount} of {companies.length} <T>companies have a custom model override.</T>
            </>
          ) : (
            <T>No companies have a custom model override.</T>
          )}
        </p>
      </div>

      <Card variant="glass" className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Tier</th>
                <th className="text-left px-4 py-3 font-medium">AI Model Override</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    <T>No companies found.</T>
                  </td>
                </tr>
              ) : (
                companies.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">
                      {c.name || <span className="text-muted-foreground">(unnamed)</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{c.tier}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {c.ai_model_override ? (
                        <span>{c.ai_model_override}</span>
                      ) : (
                        <span className="text-muted-foreground">— platform default —</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/companies/${c.id}`}
                        className="text-[hsl(var(--primary))] hover:underline text-xs font-medium"
                      >
                        <T>Configure →</T>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
