import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getEstimateTemplateSettings } from '@/lib/queries/company'
import { EstimateTemplateForm } from '@/components/settings/estimate-template-form'
import type { CompanySettings } from '@/lib/queries/company'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Message Template | Settings' }

export default async function EstimateTemplatesPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const supabase = await createClient()
  const template = await getEstimateTemplateSettings(supabase, claims.sub as string)
  if (!template) redirect('/onboarding')

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Message Template</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Customize what clients see when you send them an estimate.</T>
        </p>
      </header>
      <EstimateTemplateForm company={template as unknown as CompanySettings} />
    </div>
  )
}
