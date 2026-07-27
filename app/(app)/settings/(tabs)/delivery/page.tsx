import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCompanySettings } from '@/lib/queries/company'
import { isDemoCompany } from '@/lib/demo/config'
import { DeliverySettingsForm } from '@/components/settings/delivery-settings-form'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Delivery | Settings' }

export default async function DeliveryTabPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const supabase = await createClient()
  const company = await getCompanySettings(supabase, claims.sub as string)
  if (!company) redirect('/onboarding')
  if (isDemoCompany(company.id)) redirect('/settings/company')

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Estimate Delivery & Signature</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Choose how estimates are delivered and whether clients must sign before accepting.</T>
        </p>
      </header>
      <DeliverySettingsForm company={company} />
    </div>
  )
}
