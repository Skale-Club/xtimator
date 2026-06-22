import { Skeleton } from '@/components/ui/skeleton'
import { AdminShellSkeleton } from '@/components/skeletons/admin-shell-skeleton'

export default function SeoLoading() {
  return (
    <AdminShellSkeleton>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-40 animate-pulse bg-[var(--glass-bg)]" />
          <Skeleton className="h-4 w-72 animate-pulse bg-[var(--glass-bg)]" />
        </div>

        <div className="rounded-xl border p-6 space-y-6 animate-pulse bg-[var(--glass-bg)]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>
      </div>
    </AdminShellSkeleton>
  )
}
