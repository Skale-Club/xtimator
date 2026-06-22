import { Skeleton } from '@/components/ui/skeleton'
import { AdminShellSkeleton } from '@/components/skeletons/admin-shell-skeleton'

export default function IntegrationsLoading() {
  return (
    <AdminShellSkeleton>
      <div className="flex flex-col gap-6">
        <Skeleton className="h-4 w-96 animate-pulse bg-[var(--glass-bg)]" />

        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4 animate-pulse bg-[var(--glass-bg)]">
              <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-md shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminShellSkeleton>
  )
}
