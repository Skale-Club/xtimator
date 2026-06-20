import { Skeleton } from '@/components/ui/skeleton'

export default function AuthorizeLoading() {
  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        {/* Title */}
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-full max-w-sm" />

        {/* dl rows */}
        <dl className="mt-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className={i === 2 ? 'h-10 w-full rounded-md' : 'h-4 w-48'} />
            </div>
          ))}
        </dl>

        {/* Action row */}
        <div className="mt-6 flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-md" />
          <Skeleton className="h-10 flex-1 rounded-md" />
        </div>

        <Skeleton className="mt-4 h-3 w-64" />
      </div>
    </div>
  )
}
