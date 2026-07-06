import { Skeleton } from '@/components/ui/skeleton'
import { AdminShellSkeleton } from '@/components/skeletons/admin-shell-skeleton'

export default function AdminWhatsAppLoading() {
  return (
    <AdminShellSkeleton>
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-9 w-32 animate-pulse bg-[var(--glass-bg)]" />
          <Skeleton className="h-4 w-96 max-w-full animate-pulse bg-[var(--glass-bg)]" />
          <Skeleton className="h-3 w-40 animate-pulse bg-[var(--glass-bg)]" />
        </div>

        <div className="rounded-xl border p-0 overflow-hidden animate-pulse bg-[var(--glass-bg)]">
          <div className="bg-muted/30 px-4 py-3 flex gap-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-6 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShellSkeleton>
  )
}
