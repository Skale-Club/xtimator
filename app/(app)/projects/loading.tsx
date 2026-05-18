import { Skeleton } from '@/components/ui/skeleton'

export default function ProjectsLoading() {
  return (
    <div className="space-y-6 px-6 py-8">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Project rows skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-md" />
        ))}
      </div>
    </div>
  )
}
