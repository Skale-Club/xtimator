import { Skeleton } from '@/components/ui/skeleton'

export default function WhatsAppLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <header className="flex items-center gap-2 border-b border-border px-6 py-4">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-4 w-32" />
      </header>

      {/* Body — conversation list + thread pane */}
      <div className="flex min-h-0 flex-1">
        {/* Conversation list */}
        <aside className="hidden md:flex w-80 shrink-0 flex-col overflow-y-auto border-r border-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 border-b border-border px-4 py-3"
            >
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-4 w-6 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </aside>

        {/* Thread pane */}
        <section className="min-w-0 flex-1 flex flex-col">
          {/* Thread header */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}
              >
                <Skeleton
                  className={`h-10 rounded-2xl ${i % 2 === 0 ? 'w-64' : 'w-48'}`}
                />
              </div>
            ))}
          </div>

          {/* Composer */}
          <div className="border-t border-border px-4 py-3 flex items-center gap-2">
            <Skeleton className="h-10 flex-1 rounded-md" />
            <Skeleton className="h-10 w-10 rounded-md" />
          </div>
        </section>
      </div>
    </div>
  )
}
