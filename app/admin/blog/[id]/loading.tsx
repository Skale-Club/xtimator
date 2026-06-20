import { Skeleton } from '@/components/ui/skeleton'
import { AdminShellSkeleton } from '@/components/skeletons/admin-shell-skeleton'

export default function EditPostLoading() {
  return (
    <AdminShellSkeleton>
      <div className="flex flex-col gap-8">
        <Skeleton className="h-9 w-40 animate-pulse bg-[var(--glass-bg)]" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl border p-6 space-y-5 animate-pulse bg-[var(--glass-bg)]">
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-64 w-full rounded-md" />
            </div>
          </div>
          <div className="rounded-xl border p-5 space-y-4 animate-pulse bg-[var(--glass-bg)]">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-32 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </div>
      </div>
    </AdminShellSkeleton>
  )
}
