import { Skeleton } from '@/components/ui/skeleton'
import { AdminShellSkeleton } from '@/components/skeletons/admin-shell-skeleton'

export default function AdminAttemptDetailLoading() {
  return (
    <AdminShellSkeleton>
      <div className="space-y-6">
        <Skeleton className="h-4 w-32 animate-pulse bg-[var(--glass-bg)]" />
        <Skeleton className="h-9 w-64 animate-pulse bg-[var(--glass-bg)]" />

        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4 space-y-3 animate-pulse bg-[var(--glass-bg)]">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-3 w-full max-w-2xl" />
            </div>
          ))}
        </div>
      </div>
    </AdminShellSkeleton>
  )
}
