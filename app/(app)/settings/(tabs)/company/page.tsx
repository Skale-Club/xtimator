import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCompanySettings } from '@/lib/queries/company'
import { CompanyInfoForm } from '@/components/settings/company-info-form'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Company | Settings' }

export default async function CompanyTabPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const supabase = await createClient()
  const company = await getCompanySettings(supabase, claims.sub as string)
  if (!company) redirect('/onboarding')

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Company Information</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Keep the business details that appear across estimates, client links, and generated documents up to date.</T>
        </p>
      </header>
      <CompanyInfoForm company={company} />
    </div>
  )
}
