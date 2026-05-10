import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCustomDomainSettings } from '@/lib/queries/company'
import { CustomDomainForm } from '@/components/settings/custom-domain-form'

export const metadata = { title: 'Custom Domain' }

export default async function CustomDomainPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const supabase = await createClient()
  const settings = await getCustomDomainSettings(supabase, claims.sub as string)
  if (!settings) redirect('/onboarding')

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Custom Domain</h1>
        <p className="text-sm text-muted-foreground">
          Serve estimate share links from your own domain instead of xtimator.com.
        </p>
      </div>
      <CustomDomainForm settings={settings} />
    </div>
  )
}
