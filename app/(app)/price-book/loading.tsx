import { Skeleton } from '@/components/ui/skeleton'
import { ListPage } from '@/components/ui/list-page'

/**
 * Mirrors the Price Book: card; one header row on wide screens (title, search,
 * New Category, Import CSV, Add Service; ⋯ instead of the two below lg, search
 * on its own line); then category rows (chevron, name, 32px actions) over
 * bordered item tables.
 */
export default function PriceBookLoading() {
  return (
    <ListPage className="gap-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
        <Skeleton className="h-7 w-36 flex-none" />
        <div className="flex-1 lg:hidden" />
        <div className="order-last flex w-full lg:order-none lg:w-auto lg:flex-1 lg:justify-end">
          <Skeleton className="h-9 min-w-0 flex-1 rounded-lg lg:max-w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="hidden h-9 w-36 rounded-lg lg:block" />
          <Skeleton className="hidden h-9 w-28 rounded-lg lg:block" />
          <Skeleton className="size-9 rounded-lg lg:hidden" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-4 w-44" />
            <div className="ml-auto flex items-center gap-0.5">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="ml-1.5 h-8 w-8 rounded-lg sm:w-24" />
            </div>
          </div>
          <div className="space-y-2 rounded-md border border-border p-3 md:ml-4">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex h-10 items-center gap-3">
                <Skeleton className="size-4 shrink-0 rounded" />
                <Skeleton className="size-8 shrink-0 rounded-md" />
                <Skeleton className="h-4 flex-1" style={{ maxWidth: `${260 + ((i + j) * 53) % 120}px` }} />
                <Skeleton className="ml-auto hidden h-4 w-12 md:block" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="size-6 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </ListPage>
  )
}
