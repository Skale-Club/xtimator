import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCompanySettings } from '@/lib/queries/company'
import { isDemoCompany } from '@/lib/demo/config'
import { EstimateSettingsForm } from '@/components/settings/estimate-settings-form'
import { T } from '@/components/i18n/t'
import { SettingsHeader } from '@/components/settings/settings-ui'

export const metadata = { title: 'Estimate defaults | Settings' }

export default async function EstimatesTabPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const supabase = await createClient()
  const company = await getCompanySettings(supabase, claims.sub as string)
  if (!company) redirect('/onboarding')
  if (isDemoCompany(company.id)) redirect('/settings/company')

  return (
    <div className="space-y-6">
      <SettingsHeader
        title={<T>Estimate defaults</T>}
        description={<T>What every new estimate starts with, and how it reaches your client.</T>}
      />
      <EstimateSettingsForm company={company} />
    </div>
  )
}
