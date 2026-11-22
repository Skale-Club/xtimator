import { notFound, redirect } from 'next/navigation'
import { CUSTOM_DOMAIN_ENABLED } from '@/lib/billing/plan-bullets'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCustomDomainSettings } from '@/lib/queries/company'
import { isDemoCompany } from '@/lib/demo/config'
import { CustomDomainForm } from '@/components/settings/custom-domain-form'
import { T } from '@/components/i18n/t'
import { SettingsHeader } from '@/components/settings/settings-ui'

export const metadata = { title: 'Custom Domain' }

export default async function CustomDomainPage() {
  // Hidden at launch (owner decision 2026-11-21); flip CUSTOM_DOMAIN_ENABLED to bring it back.
  if (!CUSTOM_DOMAIN_ENABLED) notFound()
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const supabase = await createClient()
  const settings = await getCustomDomainSettings(supabase, claims.sub as string)
  if (!settings) redirect('/onboarding')
  if (isDemoCompany(settings.id)) redirect('/settings/company')

  return (
    <div className="space-y-6">
      <SettingsHeader
        title={<T>Custom Domain</T>}
        description={<T>Serve estimate share links from your own domain instead of xtimator.com.</T>}
      />
      <CustomDomainForm settings={settings} />
    </div>
  )
}
