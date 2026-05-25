import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClientById, getClientProjects } from '@/lib/queries/clients'
import { ClientHeroCard } from '@/components/clients/client-hero-card'
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

  return (
    <div className="space-y-6 p-6">

      <ClientBreadcrumb clientName={client.name} />

      {/* Hero card with stats */}
      <ClientHeroCard
        client={client}
        companyId={company.id}
        currencyCode={currencyCode}
        totalValue={totalValue}
        activeCount={activeCount}
      />

      {/* Contact & Details grid */}
      <ClientInfoGrid client={client} />

      {/* Projects table */}
      <ClientProjectsSection
        clientId={client.id}
        clientName={client.name}
        projects={projects}
        currencyCode={currencyCode}
      />
    </div>
  )
}
