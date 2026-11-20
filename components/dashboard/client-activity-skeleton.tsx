import { Skeleton } from '@/components/ui/skeleton'
import { ListCard } from '@/components/ui/list-page'

/** Mirrors ClientActivityCard inside its ListCard: title + "See all", then rows. */
export function ClientActivitySkeleton() {
  return (
    <ListCard>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-5 w-14" />
      </div>
      <div className="mt-3 flex flex-col gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-0 py-2.5">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4 max-w-72" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </ListCard>
  )
}
