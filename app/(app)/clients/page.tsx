import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClientsForEditing } from '@/lib/queries/clients'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { ClientList } from '@/components/clients/client-list'

export default async function ClientsPage() {
  const claims = await getAuthClaims()

  if (!claims) redirect('/?auth=login')

  const company = await getActiveCompany()

  if (!company) redirect('/onboarding')

  const supabase = await createClient()
  const clients = await getClientsForEditing(supabase, company.id)

  return (
    // No ListPage card: the list draws its own panel on desktop and goes flat on a phone.
    <div className="w-full space-y-4 p-4 sm:p-6">
      <ClientList clients={clients} companyId={company.id} currencyCode={company.currency_code ?? undefined} />
    </div>
  )
}
