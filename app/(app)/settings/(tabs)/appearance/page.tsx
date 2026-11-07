import { redirect } from 'next/navigation'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { isDemoCompany } from '@/lib/demo/config'
import { ThemeToggleRadioGroup } from '@/components/app-shell/theme-toggle'
import { SettingsCard, SettingsHeader } from '@/components/settings/settings-ui'

export const metadata = { title: 'Appearance | Settings' }

export default async function AppearanceTabPage() {
  const companyId = await getActiveCompanyId()
  if (isDemoCompany(companyId)) redirect('/settings/company')

  return (
    <div className="space-y-6">
      <SettingsHeader
        title={<>Appearance</>}
        description={<>Choose how the app looks. System follows your device&rsquo;s preference.</>}
      />
      <SettingsCard title="Theme" description="Applies to this device only.">
        <ThemeToggleRadioGroup />
      </SettingsCard>
    </div>
  )
}
