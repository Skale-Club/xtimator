import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClients } from '@/lib/queries/clients'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
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

  return (
    <div className="mx-auto max-w-[700px] px-4 py-8">
      <NewProjectWizard clients={clients} />
    </div>
  )
}
