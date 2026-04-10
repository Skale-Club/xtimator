import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClients } from '@/lib/queries/clients'
import { ClientList } from '@/components/clients/client-list'

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null

  if (!claims) redirect('/auth/login')

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (!company) redirect('/onboarding')

  const clients = await getClients(supabase, company.id)

  return (
    <div className="space-y-6">
      <ClientList clients={clients} companyId={company.id} />
    </div>
  )
}
