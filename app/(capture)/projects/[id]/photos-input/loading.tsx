import { Skeleton } from '@/components/ui/skeleton'

export default function PhotosInputLoading() {
  return (
    <div className="flex flex-col h-screen bg-background">
      {/* App-style header bar */}
      <header className="flex items-center gap-3 border-b border-border px-4 h-14 shrink-0">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      </header>

      {/* Main — drop zone + thumbnail grid + submit */}
      <main className="flex-1 flex flex-col px-4 py-6 gap-6 min-h-0 overflow-y-auto">
        <div className="rounded-xl border p-6 flex-1 space-y-4 max-w-2xl w-full mx-auto">
          {/* Drop zone */}
          <Skeleton className="h-32 w-full rounded-md" />

          {/* Uploaded photos grid (4 col) */}
          <div className="grid grid-cols-4 gap-2 mt-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-md" />
            ))}
          </div>
        </div>

        <div className="shrink-0 max-w-2xl w-full mx-auto">
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      </main>
    </div>
  )
}
