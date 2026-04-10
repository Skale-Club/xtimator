import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClients } from '@/lib/queries/clients'
import { INDUSTRIES } from '@/lib/industries'
import { NewProjectWizard } from '@/components/projects/new-project-wizard'

export default async function NewProjectPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null

  if (!claims) {
    redirect('/auth/login')
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id, industry')
    .eq('user_id', claims.sub)
    .single()

  if (!company) {
    redirect('/onboarding')
  }

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
