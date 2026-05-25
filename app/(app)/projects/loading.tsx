import { Skeleton } from '@/components/ui/skeleton'

export default function ProjectsLoading() {
  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-20 rounded-md" />
            ))}
          </div>
          <Skeleton className="h-10 w-[180px] rounded-md" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-10 w-36 rounded-md" />
      </header>

      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-md" />
        ))}
      </div>
    </div>
  )
}
