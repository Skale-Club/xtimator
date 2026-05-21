import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCustomDomainSettings } from '@/lib/queries/company'
import { CustomDomainForm } from '@/components/settings/custom-domain-form'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Custom Domain' }

export default async function CustomDomainPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const supabase = await createClient()
  const settings = await getCustomDomainSettings(supabase, claims.sub as string)
  if (!settings) redirect('/onboarding')

  return (
    <div className="space-y-8 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Custom Domain</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Serve estimate share links from your own domain instead of xtimator.com.</T>
        </p>
      </header>
      <Card variant="glass" className="p-8">
        <CustomDomainForm settings={settings} />
      </Card>
    </div>
  )
}
