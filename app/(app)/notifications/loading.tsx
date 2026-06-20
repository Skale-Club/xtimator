import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function NotificationsLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <Skeleton className="h-9 w-48 rounded-md" />
        <Skeleton className="h-4 w-80" />
      </header>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>

      {/* Notification cards — icon circle + 2-line content */}
      <ul className="flex flex-col gap-2" aria-label="Loading notifications">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i}>
            <Card variant="glass" className="flex items-start gap-3 px-4 py-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-3 w-12 shrink-0" />
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
