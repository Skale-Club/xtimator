import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { ProfileSection } from '@/components/settings/profile-section'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'General | Settings' }

export default async function GeneralTabPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch the current user's personal WhatsApp number (company_whatsapp is deny-all RLS)
  const userId = claims.sub as string
  const activeCompanyId = await getActiveCompanyId()
  let whatsappPhone = ''
  if (activeCompanyId && userId) {
    const svc = requireServiceClient()
    const { data: waRow } = await svc
      .from('company_whatsapp')
      .select('owner_phone')
      .eq('company_id', activeCompanyId)
      .eq('user_id', userId)
      .maybeSingle()
    whatsappPhone = waRow?.owner_phone ?? ''
  }

  const profile = {
    fullName: (user?.user_metadata?.full_name as string | undefined) ?? '',
    phone:    (user?.user_metadata?.phone    as string | undefined) ?? '',
    avatarUrl:(user?.user_metadata?.avatar_url as string | undefined) ?? null,
    email:    user?.email ?? '',
    whatsappPhone,
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>General</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Your personal profile: name, phone, and the photo shown on sign-in.</T>
        </p>
      </header>
      <ProfileSection profile={profile} />
    </div>
  )
}
