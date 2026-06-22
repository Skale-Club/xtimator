import { Skeleton } from '@/components/ui/skeleton'
import { AdminShellSkeleton } from '@/components/skeletons/admin-shell-skeleton'

export default function BlogLoading() {
  return (
    <AdminShellSkeleton>
      <div className="space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Skeleton className="h-9 w-32 animate-pulse bg-[var(--glass-bg)]" />
            <Skeleton className="h-4 w-56 animate-pulse bg-[var(--glass-bg)]" />
          </div>
          <Skeleton className="h-9 w-28 animate-pulse bg-[var(--glass-bg)] rounded-lg" />
        </div>

        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border p-3 animate-pulse bg-[var(--glass-bg)]">
              <Skeleton className="h-10 w-10 rounded-md shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-16 shrink-0" />
              <Skeleton className="h-8 w-8 rounded shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </AdminShellSkeleton>
  )
}
