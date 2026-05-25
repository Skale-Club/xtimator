import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="pb-12">
      <div className="px-6 pt-[clamp(32px,5vw,56px)] pb-12 space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-lg" />
        ))}
      </div>

      <div className="px-6 mt-12">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  )
}
