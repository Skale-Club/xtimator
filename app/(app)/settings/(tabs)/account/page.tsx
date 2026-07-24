import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { createClient } from '@/lib/supabase/server'
import { ProfileSection } from '@/components/settings/profile-section'
import { AccountSection } from '@/components/settings/account-section'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Account | Settings' }

export default async function AccountTabPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

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
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Account</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Manage your profile and security settings.</T>
        </p>
      </header>
      <ProfileSection profile={profile} />
      <AccountSection />
    </div>
  )
}
