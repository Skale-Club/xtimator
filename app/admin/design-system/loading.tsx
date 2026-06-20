import { Skeleton } from '@/components/ui/skeleton'
import { AdminShellSkeleton } from '@/components/skeletons/admin-shell-skeleton'

export default function AdminDesignSystemLoading() {
  return (
    <AdminShellSkeleton>
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48 animate-pulse bg-[var(--glass-bg)]" />
          <Skeleton className="h-4 w-96 max-w-full animate-pulse bg-[var(--glass-bg)]" />
        </div>

        <div className="rounded-xl border p-6 space-y-4 animate-pulse bg-[var(--glass-bg)]">
          <Skeleton className="h-5 w-40" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        </div>

        <div className="rounded-xl border p-6 space-y-4 animate-pulse bg-[var(--glass-bg)]">
          <Skeleton className="h-5 w-32" />
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-28 rounded-md" />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-5 space-y-3 animate-pulse bg-[var(--glass-bg)]">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>

        <div className="rounded-xl border p-6 space-y-4 animate-pulse bg-[var(--glass-bg)]">
          <Skeleton className="h-5 w-32" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <Skeleton className="h-24 w-full rounded-md" />
        </div>
      </div>
    </AdminShellSkeleton>
  )
}
