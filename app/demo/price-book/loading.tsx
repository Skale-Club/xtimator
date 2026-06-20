import { Skeleton } from '@/components/ui/skeleton'

export default function DemoPriceBookLoading() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-7 w-32" />

      {/* Folder groups */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <div className="overflow-hidden rounded-lg border border-border">
            {Array.from({ length: 4 }).map((_, j) => (
              <div
                key={j}
                className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0"
              >
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
