import { Skeleton } from '@/components/ui/skeleton'

export default function NewProjectLoading() {
  return (
    <div className="mx-auto max-w-[700px] space-y-6 p-4 md:p-6">
      {/* Title bar */}
      <Skeleton className="h-8 w-48" />

      {/* Form card */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-5">
        {/* Project name input */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>

        {/* Project type chips */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
        </div>

        {/* Address / notes textarea */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>

        {/* Action row */}
        <div className="flex justify-between">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
      </div>
    </div>
  )
}
