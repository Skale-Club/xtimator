import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClients } from '@/lib/queries/clients'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { NewProjectWizard } from '@/components/projects/new-project-wizard'
import { Card } from '@/components/ui/card'

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
    <div className="px-6 py-8">
      <Card variant="glass" className="max-w-2xl mx-auto p-8">
        <NewProjectWizard clients={clients} />
      </Card>
    </div>
  )
}
