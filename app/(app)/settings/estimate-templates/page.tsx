import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getEstimateTemplateSettings } from '@/lib/queries/company'
import { EstimateTemplateForm } from '@/components/settings/estimate-template-form'
import type { CompanySettings } from '@/lib/queries/company'

export const metadata = { title: 'Estimate Templates' }

export default async function EstimateTemplatesPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const supabase = await createClient()
  const template = await getEstimateTemplateSettings(supabase, claims.sub as string)
  if (!template) redirect('/onboarding')

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Estimate Templates</h1>
        <p className="text-sm text-muted-foreground">
          Customize the greeting, opener, closing, and signature for your plain-text estimates.
          Changes apply to all future estimates — existing generated text is not affected.
        </p>
      </div>
      <EstimateTemplateForm company={template as unknown as CompanySettings} />
    </div>
  )
}
