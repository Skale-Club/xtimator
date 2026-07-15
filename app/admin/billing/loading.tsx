import { Skeleton } from '@/components/ui/skeleton'
import { AdminShellSkeleton } from '@/components/skeletons/admin-shell-skeleton'

export default function BillingLoading() {
  return (
    <AdminShellSkeleton>
      <div className="space-y-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-24 animate-pulse bg-[var(--glass-bg)]" />
            <Skeleton className="h-4 w-80 animate-pulse bg-[var(--glass-bg)]" />
          </div>

          <div className="rounded-xl border p-5 space-y-3 animate-pulse bg-[var(--glass-bg)] w-full md:w-auto md:min-w-[240px] md:shrink-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>

        <div className="rounded-xl border p-5 space-y-4 animate-pulse bg-[var(--glass-bg)]">
          <Skeleton className="h-5 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-8 w-20 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShellSkeleton>
  )
}
