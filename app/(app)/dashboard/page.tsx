import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDashboardStats, getProjects } from '@/lib/queries/dashboard'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { DashboardStatsClient } from '@/components/dashboard/dashboard-stats-client'
import { ProjectList } from '@/components/dashboard/project-list'
import { ListCard } from '@/components/ui/list-page'
import { RecentProjectsSkeleton, StatCardsSkeleton } from '@/components/dashboard/dashboard-skeletons'
import { DashboardWelcome } from '@/components/dashboard/dashboard-welcome'
import { cookies } from 'next/headers'
import { getWhatsAppDisplayNumber } from '@/lib/platform-config'
import { WHATSAPP_WELCOME_COOKIE, buildFirstEstimateLink } from '@/lib/whatsapp/welcome-card'
import { WhatsAppWelcomeCard } from '@/components/dashboard/whatsapp-welcome-card'

export default async function DashboardPage() {
  const claims = await getAuthClaims()

  if (!claims) {
    redirect('/?auth=login')
  }

  const company = await getActiveCompany()

  if (!company) {
    redirect('/onboarding')
  }

  const firstName = (company.owner_name ?? '').split(' ')[0] || company.name

  return (
    <div className="pb-12">
      <DashboardWelcome firstName={firstName} />

      <Suspense fallback={null}>
        <WhatsAppWelcome />
      </Suspense>

      <Suspense fallback={<StatCardsSkeleton />}>
          <DashboardStats companyId={company.id} currencyCode={company.currency_code} />
      </Suspense>

      <section className="mt-8 px-4 sm:mt-12 sm:px-6">
        <Suspense fallback={<RecentProjectsSkeleton />}>
          <DashboardProjects companyId={company.id} />
        </Suspense>
      </section>
    </div>
  )
}

// Shown once after onboarding (cookie set by createOrUpdateCompany). The platform
// display number is read server-side; with no number configured nothing renders.
async function WhatsAppWelcome() {
  const jar = await cookies()
  if (!jar.get(WHATSAPP_WELCOME_COOKIE)) return null
  const href = buildFirstEstimateLink(await getWhatsAppDisplayNumber())
  return href ? <WhatsAppWelcomeCard href={href} /> : null
}

async function DashboardStats({ companyId, currencyCode }: { companyId: string; currencyCode: string }) {
  const supabase = await createClient()
  const stats = await getDashboardStats(supabase, companyId)
  return <DashboardStatsClient stats={stats} currencyCode={currencyCode} />
}

async function DashboardProjects({ companyId }: { companyId: string }) {
  const supabase = await createClient()
  const projects = await getProjects(supabase, companyId)
  // Same glass card as the Projects, Clients and Price Book screens.
  return <ListCard><ProjectList projects={projects} /></ListCard>
}
