import { Skeleton } from '@/components/ui/skeleton'

export default function ProjectsLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Header — filter chips + search + result count + new-project CTA */}
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

      {/* Project list rows — avatar + title + meta + status + total */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-md border border-border bg-card p-3"
          >
            <Skeleton className="h-9 w-9 rounded-md shrink-0" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full shrink-0" />
            <Skeleton className="h-4 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
