import { Skeleton } from '@/components/ui/skeleton'
import { ListPage } from '@/components/ui/list-page'
import { ListRowsSkeleton } from '@/components/ui/list-skeleton'

/**
 * Mirrors the Clients screen: card, then one row on wide screens (title,
 * search, sort, "Add Client"); on smaller ones the search drops under the title.
 */
export default function ClientsLoading() {
  return (
    <ListPage>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
          <Skeleton className="h-7 w-28 flex-none" />
          <div className="flex-1 lg:hidden" />
          <div className="order-last flex w-full items-center gap-2 lg:order-none lg:w-auto lg:flex-1 lg:justify-end">
            <Skeleton className="h-9 min-w-0 flex-1 rounded-lg lg:max-w-64" />
            <Skeleton className="hidden h-9 w-24 rounded-lg lg:block" />
            <Skeleton className="h-9 w-24 rounded-lg lg:hidden" />
          </div>
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
        <ListRowsSkeleton rows={6} columns={4} leading />
      </div>
    </ListPage>
  )
}
