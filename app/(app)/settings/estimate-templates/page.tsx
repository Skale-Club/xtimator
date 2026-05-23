import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getEstimateTemplateSettings } from '@/lib/queries/company'
import { EstimateTemplateForm } from '@/components/settings/estimate-template-form'
import { EstimateTermsForm } from '@/components/settings/estimate-terms-form'
import type { CompanySettings } from '@/lib/queries/company'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Estimate Templates' }

export default async function EstimateTemplatesPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const supabase = await createClient()
  const template = await getEstimateTemplateSettings(supabase, claims.sub as string)
  if (!template) redirect('/onboarding')

  return (
    <div className="space-y-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Estimate Templates</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Customize the greeting, opener, closing, and signature for your plain-text estimates. Changes apply to all future estimates | existing generated text is not affected.</T>
        </p>
      </header>
      <Card variant="glass" className="p-8">
        <EstimateTemplateForm company={template as unknown as CompanySettings} />
      </Card>
      <EstimateTermsForm company={template as unknown as CompanySettings} />
    </div>
  )
}
