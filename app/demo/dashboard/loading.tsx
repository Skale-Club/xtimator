import { Skeleton } from '@/components/ui/skeleton'

export default function DemoDashboardLoading() {
  return (
    <div className="space-y-8 pb-8">
      {/* Heading block */}
      <section className="px-6 pt-4 space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </section>

      {/* Stat cards — 4 column */}
      <div className="grid grid-cols-1 gap-4 px-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Recent projects table */}
      <section className="px-6 space-y-4">
        <Skeleton className="h-6 w-40" />
        <div className="overflow-x-auto rounded-lg border border-border">
          <div className="bg-muted/40 px-4 py-2 flex gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20 ml-auto" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 w-20 ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
