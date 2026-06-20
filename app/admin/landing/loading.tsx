import { Skeleton } from '@/components/ui/skeleton'
import { AdminShellSkeleton } from '@/components/skeletons/admin-shell-skeleton'

export default function LandingLoading() {
  return (
    <AdminShellSkeleton>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-56 animate-pulse bg-[var(--glass-bg)]" />
          <Skeleton className="h-4 w-80 animate-pulse bg-[var(--glass-bg)]" />
        </div>

        <div className="rounded-xl border overflow-hidden animate-pulse bg-[var(--glass-bg)]">
          <div className="flex border-b border-border px-4 py-2 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-24 rounded-md" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
            <div className="rounded-lg border p-4 space-y-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-40 w-full rounded" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-32 w-full rounded-md" />
              </div>
              <Skeleton className="h-9 w-28 rounded-md ml-auto" />
            </div>
          </div>
        </div>
      </div>
    </AdminShellSkeleton>
  )
}
