import { Skeleton } from '@/components/ui/skeleton'
import { RecentProjectsSkeleton, StatCardsSkeleton } from '@/components/dashboard/dashboard-skeletons'

export default function DashboardLoading() {
  return (
    <div className="pb-12">
      {/* Hero mirrors the compact phone greeting and larger desktop spacing. */}
      <div className="space-y-2 px-4 py-4 sm:space-y-3 sm:px-6 sm:py-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64 max-w-full sm:h-9" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <StatCardsSkeleton />

      <section className="mt-8 px-4 sm:mt-12 sm:px-6">
        <RecentProjectsSkeleton />
      </section>
    </div>
  )
}
