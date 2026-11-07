import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getEstimateTemplateSettings } from '@/lib/queries/company'
import { isDemoCompany } from '@/lib/demo/config'
import { EstimateTemplateForm } from '@/components/settings/estimate-template-form'
import type { CompanySettings } from '@/lib/queries/company'
import { T } from '@/components/i18n/t'
import { SettingsHeader } from '@/components/settings/settings-ui'

export const metadata = { title: 'Client message | Settings' }

export default async function EstimateTemplatesPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const supabase = await createClient()
  const template = await getEstimateTemplateSettings(supabase, claims.sub as string)
  if (!template) redirect('/onboarding')
  if (isDemoCompany(template.id)) redirect('/settings/company')

  return (
    <div className="space-y-6">
      <SettingsHeader
        title={<T>Client message</T>}
        description={<T>The text that goes with every estimate you send.</T>}
      />
      <EstimateTemplateForm company={template as unknown as CompanySettings} />
    </div>
  )
}
