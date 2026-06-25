import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireCompanyRole, type CompanyRole } from '@/lib/auth/require-company-role'
import { listCompanyRoster } from '@/lib/queries/team'
import { TeamSection } from '@/components/settings/team-section'
import { T } from '@/components/i18n/t'

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
  const canManage = role === 'owner' || role === 'admin'

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

  return (
    <TeamSection
      companyId={companyId}
      members={roster.members}
      invites={roster.invites}
      canManage={canManage}
    />
  )
}
