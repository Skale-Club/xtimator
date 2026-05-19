import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCompanySettings } from '@/lib/queries/company'
import { NotificationsForm } from '@/components/settings/notifications-form'
import { EstimateTermsForm } from '@/components/settings/estimate-terms-form'
import { DeliverySettingsForm } from '@/components/settings/delivery-settings-form'

export const metadata = { title: 'Notifications — Settings' }

export default async function NotificationsTabPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const supabase = await createClient()
  const company = await getCompanySettings(supabase, claims.sub as string)
  if (!company) redirect('/onboarding')

  return (
    <div className="space-y-6">
      <NotificationsForm company={company} />
      <EstimateTermsForm company={company} />
      <DeliverySettingsForm company={company} />
    </div>
  )
}
