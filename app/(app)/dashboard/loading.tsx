import { Skeleton } from '@/components/ui/skeleton'
import { RecentProjectsSkeleton, StatCardsSkeleton } from '@/components/dashboard/dashboard-skeletons'

export default function DashboardLoading() {
  return (
    <div className="pb-12">
      {/* Hero — mirrors the "Dashboard" label, greeting and subtitle (px-6 py-6) */}
      <div className="space-y-3 px-6 py-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <StatCardsSkeleton />

      <section className="mt-12 px-6">
        <RecentProjectsSkeleton />
      </section>
    </div>
  )
}
