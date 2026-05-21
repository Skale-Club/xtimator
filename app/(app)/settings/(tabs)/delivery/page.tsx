import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCompanySettings } from '@/lib/queries/company'
import { DeliverySettingsForm } from '@/components/settings/delivery-settings-form'

export const metadata = { title: 'Delivery | Settings' }

export default async function DeliveryTabPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const supabase = await createClient()
  const company = await getCompanySettings(supabase, claims.sub as string)
  if (!company) redirect('/onboarding')

  return <DeliverySettingsForm company={company} />
}
