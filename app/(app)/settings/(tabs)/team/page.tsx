import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireCompanyRole, type CompanyRole } from '@/lib/auth/require-company-role'
import { isDemoCompany } from '@/lib/demo/config'
import { listCompanyRoster } from '@/lib/queries/team'
import { TeamSection } from '@/components/settings/team-section'
import { createClient } from '@/lib/supabase/server'
import { T } from '@/components/i18n/t'
import { SettingsHeader } from '@/components/settings/settings-ui'

export const metadata = { title: 'Team | Settings' }

export default async function TeamTabPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const companyId = await getActiveCompanyId()
  if (!companyId) redirect('/onboarding')

  // Resolve the viewer's role ONLY to decide what to render. This is NOT the
  // security boundary — every mutation re-checks requireCompanyManager server-side.
  let role: CompanyRole | null = null
  try {
    role = (await requireCompanyRole(companyId, ['owner', 'admin', 'member'])).role
  } catch {
    redirect('/settings')
  }
  const canManage = !isDemoCompany(companyId) && (role === 'owner' || role === 'admin')

  const roster = await listCompanyRoster(companyId)
  if ('error' in roster) {
    return (
      <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg text-center">
        <p className="text-sm font-medium">
          <T>We couldn&apos;t load your team right now.</T>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          <T>Please try again in a moment.</T>
        </p>
      </div>
    )
  }

  // The owner row is created before the owner's name/email are known, so it
  // can come back blank. Fill the signed-in person's own row from their auth
  // profile instead of showing "—" (only fetched when it is actually blank).
  const selfId = claims.sub as string
  let members = roster.members
  if (members.some((m) => m.user_id === selfId && (!m.display_name || !m.email))) {
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const name = (user?.user_metadata?.full_name as string | undefined) || null
      const contact = user?.email || (user?.phone ? `+${user.phone.replace(/^\+/, '')}` : null)
      members = members.map((m) =>
        m.user_id === selfId
          ? { ...m, display_name: m.display_name ?? name, email: m.email ?? contact }
          : m,
      )
    } catch {
      // Keep the roster as-is; the row falls back to a generic label.
    }
  }

  return (
    <div className="space-y-6">
      <SettingsHeader
        title={<T>Team</T>}
        description={<T>People who can create clients and estimates. Their name appears as &ldquo;Prepared by&rdquo; on estimates they generate.</T>}
      />
      <TeamSection
        companyId={companyId}
        currentUserId={selfId}
        members={members}
        invites={roster.invites}
        canManage={canManage}
      />
    </div>
  )
}
