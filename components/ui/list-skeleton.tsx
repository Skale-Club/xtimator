import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Loading placeholders built from the same measurements as the real list
 * (list-toolbar.tsx + data-table.tsx): 36px controls, the one-row toolbar from
 * lg, search + Filters below it, table rows from md, cards below. Used by every
 * list screen's loading.tsx so a skeleton can't drift from what it stands for.
 */

const control = 'h-9 rounded-lg'

/** Title row: heading on the left, `actions` button-sized blocks on the right. */
export function ListHeaderSkeleton({ actions = 0, titleWidth = 'w-40', lastActionClass = 'w-28' }: { actions?: number; titleWidth?: string; lastActionClass?: string }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <Skeleton className={cn('h-7', titleWidth)} />
      <div className="flex items-center gap-2">
        {Array.from({ length: actions }).map((_, i) => (
          <Skeleton key={i} className={cn(control, i === actions - 1 ? lastActionClass : 'hidden w-32 lg:block')} />
        ))}
      </div>
    </div>
  )
}

/**
 * The toolbar row. `tabs` = number of status tabs (0 for none), `filter` adds
 * a picker like "All clients". Phone/tablet: search + Filters button.
 */
export function ListToolbarSkeleton({ tabs = 0, filter = false, sort = true }: { tabs?: number; filter?: boolean; sort?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {tabs > 0 && <Skeleton className={cn(control, 'hidden shrink-0 lg:block')} style={{ width: `${tabs * 68}px` }} />}
      {filter && <Skeleton className={cn(control, 'hidden w-36 shrink-0 lg:block')} />}
      <Skeleton className={cn(control, 'min-w-0 flex-1 lg:ml-auto lg:max-w-64')} />
      {sort && <Skeleton className={cn(control, 'hidden w-28 lg:block')} />}
      {(tabs > 0 || filter || sort) && <Skeleton className={cn(control, 'w-24 lg:hidden')} />}
    </div>
  )
}

/** Table rows (md+) and card rows (phone). `leading` draws an avatar/thumbnail. */
export function ListRowsSkeleton({ rows = 6, columns = 4, leading = false }: { rows?: number; columns?: number; leading?: boolean }) {
  return (
    <>
      <div className="hidden md:block">
        <div className="flex items-center gap-6 border-b border-border px-2 py-3">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3', c === 0 ? 'w-24 flex-[2]' : 'w-16 flex-1')} />
          ))}
          <Skeleton className="h-3 w-10" />
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex h-[57px] items-center gap-6 border-b border-border/60 px-2 last:border-0">
            <div className="flex flex-[2] items-center gap-3">
              {leading && <Skeleton className="size-8 shrink-0 rounded-full" />}
              <Skeleton className="h-4" style={{ width: `${55 + ((r * 17) % 35)}%` }} />
            </div>
            {Array.from({ length: columns - 1 }).map((_, c) => (
              <div key={c} className="flex-1"><Skeleton className="h-4" style={{ width: `${45 + ((r + c) * 13) % 40}%` }} /></div>
            ))}
            <Skeleton className="size-6 rounded-md" />
          </div>
        ))}
      </div>
      <div className="md:hidden">
        {Array.from({ length: Math.min(rows, 5) }).map((_, r) => (
          <div key={r} className="flex items-center gap-3 border-b border-border/50 py-3 last:border-0">
            {leading && <Skeleton className="size-9 shrink-0 rounded-full" />}
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4" style={{ width: `${55 + ((r * 17) % 35)}%` }} />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-4 w-14 shrink-0" />
            <Skeleton className="size-6 shrink-0 rounded-md" />
          </div>
        ))}
      </div>
    </>
  )
}
