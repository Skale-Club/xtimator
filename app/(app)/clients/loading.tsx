import { Skeleton } from '@/components/ui/skeleton'

export default function ClientsLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Skeleton className="h-10 w-full max-w-sm rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      <div className="space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    </div>
  )
}
