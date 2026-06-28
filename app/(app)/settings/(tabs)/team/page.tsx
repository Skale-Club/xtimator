import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireCompanyRole, type CompanyRole } from '@/lib/auth/require-company-role'
import { listCompanyRoster } from '@/lib/queries/team'
import { buildSeatCostSummary, type SeatCostSummary } from '@/lib/billing/seat-cost-summary'
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

  // Seat-cost summary (SEAT-08) — owner/admin only. Computed server-side from
  // the runtime billing config + the company tier, reusing the Phase-139 pure seat math.
  // The active seat count is the live roster member rows. A plain member gets
  // null and the cost line is not rendered (consistent with the manage gate).
  const seatCost: SeatCostSummary | null =
    canManage ? await buildSeatCostSummary(companyId, roster.members.length) : null

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Team</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>People who can create clients and estimates. Their name appears as &ldquo;Prepared by&rdquo; on estimates they generate.</T>
        </p>
      </header>
      <TeamSection
        companyId={companyId}
        members={roster.members}
        invites={roster.invites}
        canManage={canManage}
        seatCost={seatCost}
      />
    </div>
  )
}
