import { Skeleton } from '@/components/ui/skeleton'
import { AdminShellSkeleton } from '@/components/skeletons/admin-shell-skeleton'

export default function AdminCompaniesLoading() {
  return (
    <AdminShellSkeleton>
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-9 w-40 animate-pulse bg-[var(--glass-bg)]" />
          <Skeleton className="h-4 w-96 max-w-full animate-pulse bg-[var(--glass-bg)]" />
          <Skeleton className="h-3 w-72 animate-pulse bg-[var(--glass-bg)]" />
        </div>

        <div className="rounded-xl border p-0 overflow-hidden animate-pulse bg-[var(--glass-bg)]">
          <div className="bg-muted/30 px-4 py-3 flex gap-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-16 ml-auto" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-5 w-12 rounded-full" />
                <Skeleton className="h-3 w-48 font-mono" />
                <Skeleton className="h-7 w-24 rounded-md ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShellSkeleton>
  )
}
