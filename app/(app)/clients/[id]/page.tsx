import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClientById, getClientProjects } from '@/lib/queries/clients'
import { ClientHeader } from '@/components/clients/client-header'
import { ClientInfoGrid } from '@/components/clients/client-info-grid'
import { ClientProjectsSection } from '@/components/clients/client-projects-section'
import { ClientBreadcrumb } from '@/components/clients/client-breadcrumb'

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null

  if (!claims) redirect('/?auth=login')

  const { data: company } = await supabase
    .from('companies')
    .select('id, currency_code')
    .eq('user_id', claims.sub)
    .single()

  if (!company) redirect('/onboarding')

  const client = await getClientById(supabase, id)
  if (!client) notFound()

  const projects = await getClientProjects(supabase, id)

  const currencyCode = (company.currency_code as string) ?? 'USD'
  const totalValue = projects.reduce((sum, p) => sum + (p.total ?? 0), 0)
  const activeCount = projects.filter((p) => p.status !== 'archived' && p.status !== 'declined').length
  // getClientProjects is newest first.
  const lastActivityAt = projects[0]?.created_at ?? null

  return (
    <div className="space-y-4 p-4 sm:p-6">

      <ClientBreadcrumb clientName={client.name} />

      <ClientHeader
        client={client}
        companyId={company.id}
        currencyCode={currencyCode}
        totalValue={totalValue}
        activeCount={activeCount}
        lastActivityAt={lastActivityAt}
      />

      {/* Desktop: projects in the main column, contact and notes in a sticky
          side column. Phone: projects first, then the details. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <ClientProjectsSection
          clientId={client.id}
          clientName={client.name}
          projects={projects}
          currencyCode={currencyCode}
        />
        <div className="lg:sticky lg:top-4">
          <ClientInfoGrid client={client} />
        </div>
      </div>
    </div>
  )
}
