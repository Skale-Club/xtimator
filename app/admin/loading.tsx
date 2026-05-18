import { Skeleton } from '@/components/ui/skeleton'

export default function AdminDashboardLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-36 animate-pulse bg-[var(--glass-bg)]" />
        <Skeleton className="h-4 w-56 animate-pulse bg-[var(--glass-bg)]" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="min-h-[120px] rounded-xl animate-pulse bg-[var(--glass-bg)]" />
        ))}
      </div>
    </div>
  )
}
