import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen, ChevronRight, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCompanySettings } from '@/lib/queries/company'
import { SettingsTabs } from '@/components/settings/settings-tabs'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default async function SettingsPage() {
  const claims = await getAuthClaims()

  if (!claims) {
    redirect('/login')
  }

  const supabase = await createClient()
  const company = await getCompanySettings(supabase, claims.sub as string)

  if (!company) {
    redirect('/onboarding')
  }

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Manage company profile, estimate behavior, notifications, appearance,
          and account access from one full-width workspace.
        </p>
      </div>

      <SettingsTabs company={company} />

      <Link
        href="/settings/price-book"
        className="block rounded-[var(--radius-md)] transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card className="w-full rounded-[var(--radius-md)]">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border">
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Price Book</CardTitle>
                <CardDescription>
                  Manage your standard pricing for AI-powered estimates.
                </CardDescription>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
        </Card>
      </Link>

      <Link
        href="/settings/estimate-templates"
        className="block rounded-[var(--radius-md)] transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card className="w-full rounded-[var(--radius-md)]">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Estimate Templates</CardTitle>
                <CardDescription>
                  Customize the greeting, opener, and signature for your plain-text estimates.
                </CardDescription>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
        </Card>
      </Link>
    </div>
  )
}
