import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCompanySettings } from '@/lib/queries/company'
import { DefaultsForm } from '@/components/settings/defaults-form'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Defaults | Settings' }

export default async function DefaultsTabPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const supabase = await createClient()
  const company = await getCompanySettings(supabase, claims.sub as string)
  if (!company) redirect('/onboarding')

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Estimate Defaults</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Set the reusable terms and calculation defaults applied when new estimates are created.</T>
        </p>
      </header>
      <DefaultsForm company={company} />
    </div>
  )
}
