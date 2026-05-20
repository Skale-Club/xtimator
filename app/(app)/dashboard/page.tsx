import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDashboardStats, getProjects } from '@/lib/queries/dashboard'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { StatCards } from '@/components/dashboard/stat-cards'
import { ProjectList } from '@/components/dashboard/project-list'
import { Skeleton } from '@/components/ui/skeleton'
import { T } from '@/components/i18n/t'

export default async function DashboardPage() {
  const claims = await getAuthClaims()

  if (!claims) {
    redirect('/login')
  }

  const company = await getCachedCompany(claims.sub)

  if (!company) {
    redirect('/onboarding')
  }

  const firstName = (company.owner_name ?? '').split(' ')[0] || company.name

  return (
    <div className="pb-12">
      {/* Hero zone — gradient-hero radial backdrop, display headline + primary CTA */}
      <section className="relative isolate px-6 pt-[clamp(32px,5vw,56px)] pb-12">
        {/* Gradient extends -top-16 to bleed under the glass topbar — backdrop-blur fuses the two surfaces.
            Bottom mask fades the gradient to alpha 0 so it dissolves smoothly into the page bg
            (instead of cutting off with a visible edge). */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 inset-x-0 bottom-0 -z-10 gradient-hero
                     [mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]
                     [-webkit-mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]"
        />
        <p className="text-2xl font-semibold tracking-tight">
          <T text={`Welcome back, ${firstName}`} />
        </p>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          <T>Track active projects, monitor estimate health, and start new work.</T>
        </p>
      </section>

      <Suspense fallback={<StatCardsSkeleton />}>
        <DashboardStats companyId={company.id} />
      </Suspense>

      <section className="px-6 mt-12">
        <h2 className="text-2xl font-semibold tracking-[-0.015em] mb-4">
          <T>Recent projects</T>
        </h2>
        <Suspense fallback={<ProjectListSkeleton />}>
          <DashboardProjects companyId={company.id} />
        </Suspense>
      </section>
    </div>
  )
}

async function DashboardStats({ companyId }: { companyId: string }) {
  const supabase = await createClient()
  const stats = await getDashboardStats(supabase, companyId)
  return <StatCards stats={stats} />
}

async function DashboardProjects({ companyId }: { companyId: string }) {
  const supabase = await createClient()
  const projects = await getProjects(supabase, companyId)
  return <ProjectList projects={projects} />
}

function StatCardsSkeleton() {
  return (
    <div className="px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[120px] rounded-lg" />
      ))}
    </div>
  )
}

function ProjectListSkeleton() {
  return <Skeleton className="h-64 w-full rounded-lg" />
}
