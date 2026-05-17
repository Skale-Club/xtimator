import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClients } from '@/lib/queries/clients'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { ClientList } from '@/components/clients/client-list'

export default async function ClientsPage() {
  const claims = await getAuthClaims()

  if (!claims) redirect('/login')

  const company = await getCachedCompany(claims.sub)

  if (!company) redirect('/onboarding')

  const supabase = await createClient()
  const clients = await getClients(supabase, company.id)

  return (
    <div className="px-6 py-8 space-y-6">
      <ClientList clients={clients} companyId={company.id} />
    </div>
  )
}
