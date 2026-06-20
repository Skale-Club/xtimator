import { Skeleton } from '@/components/ui/skeleton'
import { AdminShellSkeleton } from '@/components/skeletons/admin-shell-skeleton'

export default function BrandingLoading() {
  return (
    <AdminShellSkeleton>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-32 animate-pulse bg-[var(--glass-bg)]" />
          <Skeleton className="h-4 w-72 animate-pulse bg-[var(--glass-bg)]" />
        </div>

        <div className="rounded-xl border p-6 space-y-6 animate-pulse bg-[var(--glass-bg)]">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-20 w-20 rounded-md" />
              <div className="space-y-2">
                <Skeleton className="h-9 w-32 rounded-md" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>

          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-8 rounded-full" />
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
        </div>
      </div>
    </AdminShellSkeleton>
  )
}
