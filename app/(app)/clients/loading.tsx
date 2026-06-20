import { Skeleton } from '@/components/ui/skeleton'

export default function ClientsLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Toolbar — search + filter + new-client CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Skeleton className="h-10 w-full max-w-sm rounded-md" />
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Client list rows — avatar circle + name + contact + project count */}
      <div className="space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-md border border-border bg-card p-3"
          >
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-5 w-10 rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
