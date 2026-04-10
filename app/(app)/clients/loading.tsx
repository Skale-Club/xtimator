import { Skeleton } from '@/components/ui/skeleton'

export default function ClientsLoading() {
  return (
    <div className="space-y-4">
      {/* Search bar skeleton */}
      <Skeleton className="h-10 w-full max-w-sm rounded-md" />

      {/* Client rows skeleton */}
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-lg" />
      ))}
    </div>
  )
}
