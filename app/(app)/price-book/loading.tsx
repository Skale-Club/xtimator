import { Skeleton } from '@/components/ui/skeleton'

/**
 * Mirrors the Price Book so the page does not jump when it loads: same page
 * padding, then on md+ a full-height card (header row; a w-60 category column
 * beside the services) and on a phone a flat header, a search + category picker
 * row and the service rows. Keep in step with price-book-list.tsx.
 */
export default function PriceBookLoading() {
  return (
    <div className="w-full p-4 sm:p-6 md:flex md:h-full md:flex-col">
      <div className="md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden md:rounded-[var(--radius-lg)] md:border md:border-[var(--glass-border)] md:bg-[var(--glass-bg)] md:shadow-[var(--shadow-glass)]">
        {/* Header: title + summary, search, actions (search on its own line on a phone). */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3 md:shrink-0 md:border-b md:border-[var(--glass-border)] md:px-5 md:py-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-7 w-36 sm:h-8" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="order-last flex w-full min-w-0 items-center gap-2 md:order-none md:w-64">
            <Skeleton className="h-9 min-w-0 flex-1 rounded-lg" />
            <Skeleton className="h-9 w-28 shrink-0 rounded-lg md:hidden" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="hidden h-9 w-28 rounded-lg md:block" />
            <Skeleton className="size-9 rounded-lg md:hidden" />
            <Skeleton className="size-9 rounded-full sm:h-9 sm:w-32 sm:rounded-lg" />
          </div>
        </div>

        <div className="mt-4 md:mt-0 md:flex md:min-h-0 md:flex-1">
          {/* Desktop category column. */}
          <div className="hidden w-60 shrink-0 flex-col border-r border-[var(--glass-border)] md:flex">
            <div className="flex h-11 shrink-0 items-center justify-between pl-4 pr-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
            <div className="space-y-1 px-3 pb-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex h-9 items-center gap-2 px-3">
                  <Skeleton className="h-4 flex-1" style={{ maxWidth: `${96 + ((i * 37) % 70)}px` }} />
                  <Skeleton className="ml-auto h-3 w-5" />
                </div>
              ))}
            </div>
          </div>

          {/* Services: two sections of rows. */}
          <div className="min-w-0 space-y-6 md:min-h-0 md:flex-1 md:overflow-hidden md:p-5">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex min-h-11 items-center gap-2 py-1.5 md:min-h-9 md:py-0">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-5" />
                  <Skeleton className="ml-auto size-8 rounded-lg" />
                </div>
                <div className="overflow-hidden rounded-xl border border-[var(--glass-border)] md:rounded-lg">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="flex items-center gap-3 border-b border-[var(--glass-border)] px-3 py-3 last:border-b-0 md:px-4 md:py-2.5">
                      <Skeleton className="h-4 flex-1" style={{ maxWidth: `${220 + ((i + j) * 53) % 120}px` }} />
                      <Skeleton className="hidden h-4 w-20 md:block" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
