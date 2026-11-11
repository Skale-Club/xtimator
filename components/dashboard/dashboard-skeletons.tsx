import { Skeleton } from '@/components/ui/skeleton'
import { ListCard } from '@/components/ui/list-page'
import { ListHeaderSkeleton, ListRowsSkeleton, ListToolbarSkeleton } from '@/components/ui/list-skeleton'

/**
 * Dashboard placeholders, shared by app/(app)/dashboard/loading.tsx (whole
 * page) and the page's Suspense fallbacks (each section while it streams), so
 * both show exactly the layout that replaces them.
 */

/** Mirrors StatCards / StatCard: 2 columns (4 from lg), icon + label row, number below. */
export function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 px-4 sm:gap-4 sm:px-6 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2.5 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3.5 sm:p-5">
          <div className="flex min-h-8 items-center gap-2.5">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  )
}

/** Mirrors ProjectList in its card: title + "View all", 5 status tabs, rows. */
export function RecentProjectsSkeleton() {
  return (
    <ListCard>
      <div className="space-y-3">
        {/* "View all" is a small text link, not a button */}
        <ListHeaderSkeleton titleWidth="w-48" actions={1} lastActionClass="h-5 w-16" />
        <ListToolbarSkeleton tabs={5} />
        <ListRowsSkeleton rows={6} columns={4} />
      </div>
    </ListCard>
  )
}
