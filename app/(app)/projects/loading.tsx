import { ListPage } from '@/components/ui/list-page'
import { ListRowsSkeleton, ListToolbarSkeleton } from '@/components/ui/list-skeleton'

/** Mirrors the Projects screen: card, Active/Archived + client picker + search + sort, rows. */
export default function ProjectsLoading() {
  return (
    <ListPage>
      <div className="space-y-3">
        <ListToolbarSkeleton tabs={2} filter />
        <ListRowsSkeleton rows={8} columns={4} />
      </div>
    </ListPage>
  )
}
