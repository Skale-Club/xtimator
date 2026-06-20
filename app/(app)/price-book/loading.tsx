import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function PriceBookLoading() {
  return (
    <div className="w-full max-w-none space-y-6 p-4 md:space-y-8 md:p-6">
      <Card variant="glass" className="p-4 md:p-8">
        <div className="space-y-6">
          {/* Title row + action buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <Skeleton className="h-8 w-36" />
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-9 w-28 rounded-md" />
              <Skeleton className="h-9 w-28 rounded-md" />
              <Skeleton className="h-9 w-28 rounded-md" />
            </div>
          </div>

          {/* Search */}
          <Skeleton className="h-10 w-full max-w-sm rounded-md" />

          {/* Folder groups — title + bordered item rows */}
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <div className="rounded-md border p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-6 shrink-0" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-8 w-8 rounded shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
