import { redirect } from 'next/navigation'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { isDemoCompany } from '@/lib/demo/config'

export default async function PaymentsSettingsPage() {
  const companyId = await getActiveCompanyId()
  redirect(isDemoCompany(companyId) ? '/settings/company' : '/settings/integrations/stripe')
}
