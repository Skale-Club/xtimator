import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClients } from '@/lib/queries/clients'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { ClientList } from '@/components/clients/client-list'

export default async function ClientsPage() {
  const claims = await getAuthClaims()

  if (!claims) redirect('/?auth=login')

  const company = await getActiveCompany()

  if (!company) redirect('/onboarding')

  const supabase = await createClient()
  const clients = await getClients(supabase, company.id)

  return (
    <div className="p-6">
      <ClientList clients={clients} companyId={company.id} />
    </div>
  )
}
