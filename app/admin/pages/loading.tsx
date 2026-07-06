import { Skeleton } from '@/components/ui/skeleton'
import { AdminShellSkeleton } from '@/components/skeletons/admin-shell-skeleton'

export default function AdminLegalLoading() {
  return (
    <AdminShellSkeleton>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-48 animate-pulse bg-[var(--glass-bg)]" />
          <Skeleton className="h-4 w-96 max-w-full animate-pulse bg-[var(--glass-bg)]" />
        </div>

        <div className="border-b border-border flex gap-1">
          <Skeleton className="h-9 w-32 animate-pulse bg-[var(--glass-bg)]" />
          <Skeleton className="h-9 w-32 animate-pulse bg-[var(--glass-bg)]" />
        </div>

        <div className="rounded-xl border p-6 space-y-5 animate-pulse bg-[var(--glass-bg)]">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-72 w-full rounded-md" />
          </div>
          <div className="flex justify-end gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
        </div>
      </div>
    </AdminShellSkeleton>
  )
}
