import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { isDemoCompany } from '@/lib/demo/config'
import { ProfileSection } from '@/components/settings/profile-section'
import { AccountSection } from '@/components/settings/account-section'
import Link from 'next/link'
import { T } from '@/components/i18n/t'
import { SettingsCard, SettingsHeader } from '@/components/settings/settings-ui'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Account | Settings' }

export default async function AccountTabPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const companyId = await getActiveCompanyId()
  if (isDemoCompany(companyId)) redirect('/settings/company')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const profile = {
    fullName: (user?.user_metadata?.full_name as string | undefined) ?? '',
    phone:    (user?.user_metadata?.phone    as string | undefined) ?? '',
    avatarUrl:(user?.user_metadata?.avatar_url as string | undefined) ?? null,
    avatarPosition: (user?.user_metadata?.avatar_position as { scale: number; x: number; y: number } | undefined) ?? null,
    email:    user?.email ?? '',
  }

  return (
    <div className="space-y-6">
      <SettingsHeader
        title={<T>Account</T>}
        description={<T>Your profile, how you sign in, and your account.</T>}
      />
      <ProfileSection profile={profile} />
      <AccountSection />
      <SettingsCard
        className="border-destructive/30"
        title={<T>Delete account</T>}
        description={<T>Permanently delete your account and the companies you own. This can&apos;t be undone.</T>}
        action={
          <Button asChild variant="destructive" size="sm">
            <Link href="/delete-account"><T>Delete account</T></Link>
          </Button>
        }
      />
    </div>
  )
}
