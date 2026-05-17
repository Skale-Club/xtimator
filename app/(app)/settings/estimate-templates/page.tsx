import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getEstimateTemplateSettings } from '@/lib/queries/company'
import { EstimateTemplateForm } from '@/components/settings/estimate-template-form'
import type { CompanySettings } from '@/lib/queries/company'
import { Card } from '@/components/ui/card'

export const metadata = { title: 'Estimate Templates' }

export default async function EstimateTemplatesPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const supabase = await createClient()
  const template = await getEstimateTemplateSettings(supabase, claims.sub as string)
  if (!template) redirect('/onboarding')

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          Estimate Templates
        </h1>
        <p className="text-sm text-muted-foreground">
          Customize the greeting, opener, closing, and signature for your plain-text estimates.
          Changes apply to all future estimates — existing generated text is not affected.
        </p>
      </header>
      <Card variant="glass" className="p-8">
        <EstimateTemplateForm company={template as unknown as CompanySettings} />
      </Card>
    </div>
  )
}
