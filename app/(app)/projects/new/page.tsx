import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClients } from '@/lib/queries/clients'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { INDUSTRIES } from '@/lib/industries'
import { NewProjectWizard } from '@/components/projects/new-project-wizard'

export default async function NewProjectPage() {
  const claims = await getAuthClaims()

  if (!claims) {
    redirect('/login')
  }

  const company = await getCachedCompany(claims.sub)

  if (!company) {
    redirect('/onboarding')
  }

  const supabase = await createClient()
  const clients = await getClients(supabase, company.id)

  // Look up industry-specific project types
  const industry = INDUSTRIES.find((i) => i.id === company.industry)
  const projectTypes = industry?.projectTypes ? [...industry.projectTypes] : []

  return (
    <div className="mx-auto max-w-[700px] px-4 py-8">
      <NewProjectWizard clients={clients} projectTypes={projectTypes} />
    </div>
  )
}
