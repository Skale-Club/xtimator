import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { createClient } from '@/lib/supabase/server'
import { ProfileSection } from '@/components/settings/profile-section'

export const metadata = { title: 'General | Settings' }

export default async function GeneralTabPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const profile = {
    fullName: (user?.user_metadata?.full_name as string | undefined) ?? '',
    phone:    (user?.user_metadata?.phone    as string | undefined) ?? '',
    avatarUrl:(user?.user_metadata?.avatar_url as string | undefined) ?? null,
    email:    user?.email ?? '',
  }

  return <ProfileSection profile={profile} />
}
