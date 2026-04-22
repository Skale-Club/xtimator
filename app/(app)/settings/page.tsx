import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Palette, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCompanySettings } from '@/lib/queries/company'
import { CompanyInfoForm } from '@/components/settings/company-info-form'
import { DefaultsForm } from '@/components/settings/defaults-form'
import { NotificationsForm } from '@/components/settings/notifications-form'
import { AccountSection } from '@/components/settings/account-section'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null

  if (!claims) {
    redirect('/auth/login')
  }

  const company = await getCompanySettings(supabase, claims.sub as string)

  if (!company) {
    redirect('/onboarding')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <CompanyInfoForm company={company} />
      <DefaultsForm company={company} />
      <NotificationsForm company={company} />

      <Card>
        <Link
          href="/settings/appearance"
          className="block transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none rounded-xl"
        >
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-start gap-3">
              <Palette className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>
                  Dark, light, or follow your device&rsquo;s preference.
                </CardDescription>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="sr-only">
            Configure theme at /settings/appearance
          </CardContent>
        </Link>
      </Card>

      <AccountSection />
    </div>
  )
}
