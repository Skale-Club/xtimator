import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDashboardStats, getProjects } from '@/lib/queries/dashboard'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { StatCards } from '@/components/dashboard/stat-cards'
import { ProjectList } from '@/components/dashboard/project-list'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export default async function DashboardPage() {
  const claims = await getAuthClaims()

  if (!claims) {
    redirect('/login')
  }

  const company = await getCachedCompany(claims.sub)

  if (!company) {
    redirect('/onboarding')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Link>
        </Button>
      </div>

      <Suspense fallback={<StatCardsSkeleton />}>
        <DashboardStats companyId={company.id} />
      </Suspense>
      <Suspense fallback={<ProjectListSkeleton />}>
        <DashboardProjects companyId={company.id} />
      </Suspense>
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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-lg" />
      ))}
    </div>
  )
}

function ProjectListSkeleton() {
  return <Skeleton className="h-64 w-full rounded-lg" />
}
