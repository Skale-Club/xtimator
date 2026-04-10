import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCompanySettings } from '@/lib/queries/company'
import { CompanyInfoForm } from '@/components/settings/company-info-form'
import { DefaultsForm } from '@/components/settings/defaults-form'
import { NotificationsForm } from '@/components/settings/notifications-form'
import { AccountSection } from '@/components/settings/account-section'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null

  if (!claims) {
    redirect('/auth/login')
  }

  const company = await getCompanySettings(supabase, claims.sub as string)

  if (!company) {
    redirect('/onboarding')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <CompanyInfoForm company={company} />
      <DefaultsForm company={company} />
      <NotificationsForm company={company} />
      <AccountSection />
    </div>
  )
}
