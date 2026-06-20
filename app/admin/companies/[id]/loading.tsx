import { Skeleton } from '@/components/ui/skeleton'
import { AdminShellSkeleton } from '@/components/skeletons/admin-shell-skeleton'

export default function AdminCompanyDetailLoading() {
  return (
    <AdminShellSkeleton>
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32 animate-pulse bg-[var(--glass-bg)]" />
          <Skeleton className="h-9 w-64 animate-pulse bg-[var(--glass-bg)]" />
          <Skeleton className="h-4 w-96 max-w-full animate-pulse bg-[var(--glass-bg)]" />
        </div>

        <div className="rounded-xl border p-6 space-y-5 animate-pulse bg-[var(--glass-bg)]">
          <div className="space-y-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-96 max-w-full" />
          </div>

          <div className="rounded-md border p-4 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-5 w-72 font-mono" />
          </div>

          <div className="space-y-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-3 w-72" />
          </div>

          <div className="flex justify-end gap-2">
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
        </div>
      </div>
    </AdminShellSkeleton>
  )
}
