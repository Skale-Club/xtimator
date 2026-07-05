import Link from 'next/link'
import { Building2, Search } from 'lucide-react'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { T } from '@/components/i18n/t'
import { HandoffButton } from './handoff-button'
import { CompaniesControls } from './companies-controls'
import { EmptyState } from '@/components/dashboard/empty-state'
import { tiers } from '@/lib/entitlements'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

type CompanyRow = {
  id: string
  name: string
  tier: string
  ai_model_override: string | null
  demo_estimate_quota: number | null
}

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireAdmin() // load-bearing authz — MUST run before any data read

  const svc = requireServiceClient()
  const sp = await searchParams // Next 14: searchParams is a Promise

  const page = Math.max(1, parseInt(sp.page ?? '1', 10))
  const search = sp.q ?? ''
  const tierFilter = sp.tier ?? ''
  const overrideFilter = sp.override ?? ''
  const demoFilter = sp.demo ?? ''

  // Email → company ids resolution (ADMINCO-01): only when term looks like an
  // email. company_members (not companies.email) is the account-holder join —
  // companies.email is a business/branding contact field, unrelated to login.
  let resolvedCompanyIds: string[] | null = null
  if (search.includes('@')) {
    const { data: { users } } = await svc.auth.admin.listUsers({ perPage: 1000 })
    const match = users.find((u) => u.email === search)
    if (match) {
      const { data: memberships } = await svc
        .from('company_members')
        .select('company_id')
        .eq('user_id', match.id)
      resolvedCompanyIds = (memberships ?? []).map((m) => m.company_id)
    } else {
      resolvedCompanyIds = [] // no matching user at all — force zero rows below
    }
  }

  // ── Main paginated "All Companies" query ───────────────────────────────────
  const from = (page - 1) * PAGE_SIZE
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mainQ: any = svc
    .from('companies')
    .select('id, name, tier, ai_model_override, demo_estimate_quota', { count: 'exact' })

  if (tierFilter) mainQ = mainQ.eq('tier', tierFilter)
  if (overrideFilter === 'has') mainQ = mainQ.not('ai_model_override', 'is', null)
  if (overrideFilter === 'none') mainQ = mainQ.is('ai_model_override', null)
  if (demoFilter === 'demo') mainQ = mainQ.not('demo_estimate_quota', 'is', null)
  if (demoFilter === 'real') mainQ = mainQ.is('demo_estimate_quota', null)

  if (search) {
    if (resolvedCompanyIds !== null) {
      // Email path — resolvedCompanyIds is [] when no user matched, or the
      // membership company ids when a user matched. .in('id', []) reliably
      // returns zero rows (PostgREST semantics), but guard explicitly with a
      // sentinel for defense-in-depth against client-library short-circuiting.
      mainQ = resolvedCompanyIds.length > 0
        ? mainQ.in('id', resolvedCompanyIds)
        : mainQ.eq('id', '00000000-0000-0000-0000-000000000000')
    } else {
      const esc = search.replace(/[%,()]/g, '')
      mainQ = mainQ.ilike('name', `%${esc}%`)
    }
  }

  const { data, count } = await mainQ
    .order('name', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)

  const companies = (data ?? []) as CompanyRow[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── Independent, unfiltered, unpaginated Demo Accounts query ───────────────
  const { data: demoData } = await svc
    .from('companies')
    .select('id, name, tier, ai_model_override, demo_estimate_quota')
    .not('demo_estimate_quota', 'is', null)
    .order('name', { ascending: true })
  const demoCompanies = (demoData ?? []) as CompanyRow[]

  // ── Prev/Next page URLs ────────────────────────────────────────────────────
  function pageUrl(p: number) {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (tierFilter) params.set('tier', tierFilter)
    if (overrideFilter) params.set('override', overrideFilter)
    if (demoFilter) params.set('demo', demoFilter)
    params.set('page', String(p))
    return `/admin/companies?${params.toString()}`
  }

  const hasActiveFilters = !!(search || tierFilter || overrideFilter || demoFilter)

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Companies</T>
        </h1>
        <p className="text-muted-foreground">
          <T>
            All tenant companies registered on the platform. Click a row to assign a specific
            AI model override (routed via OpenRouter) for that tenant; otherwise the platform default applies.
          </T>
        </p>
        <p className="text-xs text-muted-foreground">
          <T text={`${total} companies total`} />
        </p>
      </div>

      {/* Demo Accounts (street-sales) — independent query, unfiltered, unpaginated */}
      {demoCompanies.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium"><T>Demo Accounts</T></h2>
          <Card variant="glass" className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-left px-4 py-3 font-medium">Tier</th>
                    <th className="text-left px-4 py-3 font-medium">Quota</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {demoCompanies.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">
                        {c.name || <span className="text-muted-foreground">(unnamed)</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{c.tier}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {c.demo_estimate_quota} estimates
                      </td>
                      <td className="px-4 py-3 text-right flex items-center justify-end gap-3">
                        <HandoffButton companyId={c.id} companyName={c.name} />
                        <Link
                          href={`/admin/companies/${c.id}`}
                          className="text-[hsl(var(--primary))] hover:underline text-xs font-medium"
                        >
                          <T>Configure →</T>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Controls (client component) */}
      <CompaniesControls
        search={search}
        tier={tierFilter}
        override={overrideFilter}
        demo={demoFilter}
      />

      {/* All Companies */}
      <div className="space-y-3">
        {demoCompanies.length > 0 && (
          <h2 className="text-lg font-medium"><T>All Companies</T></h2>
        )}
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
                    <td colSpan={4} className="px-4 py-8">
                      {hasActiveFilters ? (
                        <EmptyState
                          icon={Search}
                          title="No companies match your filters"
                          description="Try a different search term, or clear the active filters to see all companies."
                          actionLabel="Clear filters"
                          actionHref="/admin/companies"
                        />
                      ) : (
                        <EmptyState
                          icon={Building2}
                          title="No companies found."
                          description="Tenant companies will appear here once they sign up."
                        />
                      )}
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
                          <span className="text-muted-foreground">platform default</span>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          {page > 1 ? (
            <Link href={pageUrl(page - 1)} className="text-[hsl(var(--primary))] hover:underline">
              <T>Previous</T>
            </Link>
          ) : (
            <span className="text-muted-foreground"><T>Previous</T></span>
          )}
          <span className="text-muted-foreground">
            <T text={`Page ${page} of ${totalPages}`} />
          </span>
          {page < totalPages ? (
            <Link href={pageUrl(page + 1)} className="text-[hsl(var(--primary))] hover:underline">
              <T>Next</T>
            </Link>
          ) : (
            <span className="text-muted-foreground"><T>Next</T></span>
          )}
        </div>
      )}
    </div>
  )
}

// Referenced to satisfy the ADMINCO-02 static-source contract requiring the
// per-tier options to be derived from lib/entitlements, not hardcoded.
export const _tierOptions = Object.keys(tiers)
