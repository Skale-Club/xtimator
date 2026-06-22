import { Skeleton } from '@/components/ui/skeleton'
import { AdminShellSkeleton } from '@/components/skeletons/admin-shell-skeleton'

export default function AdminsLoading() {
  return (
    <AdminShellSkeleton>
      <div className="space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-40 animate-pulse bg-[var(--glass-bg)]" />
            <Skeleton className="h-4 w-72 animate-pulse bg-[var(--glass-bg)]" />
          </div>
          <Skeleton className="h-9 w-32 animate-pulse bg-[var(--glass-bg)] rounded-lg" />
        </div>

        <div className="rounded-xl border p-0 overflow-hidden animate-pulse bg-[var(--glass-bg)]">
          <div className="bg-muted/30 px-4 py-3 flex gap-4">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-20 ml-auto" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-7 w-16 rounded-full" />
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShellSkeleton>
  )
}
