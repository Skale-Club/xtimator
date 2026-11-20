import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { getProjectsForListPage, type ProjectListStatus } from '@/lib/queries/project'
import { getClientsForEditing } from '@/lib/queries/clients'
import { getPausedCaptures, withPausedStatus } from '@/lib/queries/credit-pauses'
import { ProjectsPageShell } from '@/components/projects/projects-page-shell'

function parseStatus(raw: string | string[] | undefined): ProjectListStatus {
  const v = Array.isArray(raw) ? raw[0] : raw
  return v === 'archived' ? v : 'active'
}

function parseClient(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  // Reject anything that doesn't look like a UUID — prevents arbitrary string injection into the .eq filter.
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; client?: string }>
}) {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const company = await getActiveCompany()
  if (!company) redirect('/onboarding')

  const sp = await searchParams
  const status = parseStatus(sp.status)
  const clientId = parseClient(sp.client)

  const supabase = await createClient()
  const [listed, clients, paused] = await Promise.all([
    getProjectsForListPage(supabase, company.id, { status, clientId }),
    getClientsForEditing(supabase, company.id),
    getPausedCaptures(company.id),
  ])
  // Credits plan 2026-11-20: a capture paused for credits shows on its project.
  const projects = withPausedStatus(listed, paused)

  return (
    <ProjectsPageShell
      status={status}
      clientId={clientId}
      currencyCode={company.currency_code}
      companyId={company.id}
      projects={projects}
      clients={clients}
    />
  )
}
