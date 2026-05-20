import { Card } from '@/components/ui/card'

export default function NotificationsLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <div className="h-9 w-48 rounded-md bg-muted/40 animate-pulse" />
        <div className="h-4 w-80 rounded bg-muted/30 animate-pulse" />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-7 w-20 rounded-full bg-muted/30 animate-pulse"
          />
        ))}
      </div>

      <ul className="flex flex-col gap-2" aria-label="Loading notifications">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i}>
            <Card
              variant="glass"
              className="flex items-start gap-3 px-4 py-3"
            >
              <div className="h-8 w-8 shrink-0 rounded-full bg-muted/40 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-muted/40 animate-pulse" />
                <div className="h-3 w-2/3 rounded bg-muted/30 animate-pulse" />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
