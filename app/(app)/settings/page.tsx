import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCompanySettings } from '@/lib/queries/company'
import { SettingsTabs } from '@/components/settings/settings-tabs'

export default async function SettingsPage() {
  const claims = await getAuthClaims()

  if (!claims) {
    redirect('/login')
  }

  const supabase = await createClient()
  const company = await getCompanySettings(supabase, claims.sub as string)

  if (!company) {
    redirect('/onboarding')
  }

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Manage company profile, estimate behavior, notifications, appearance,
          and account access from one full-width workspace.
        </p>
      </div>

      <SettingsTabs company={company} />
    </div>
  )
}
