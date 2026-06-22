import { Skeleton } from '@/components/ui/skeleton'

export default function DescribeLoading() {
  return (
    <div className="flex flex-col h-screen bg-background">
      {/* App-style header bar with back + project title */}
      <header className="flex items-center gap-3 border-b border-border px-4 h-14 shrink-0">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      </header>

      {/* Main — textarea + tip + submit */}
      <main className="flex-1 flex flex-col px-4 py-6 gap-6 min-h-0 overflow-y-auto">
        <div className="rounded-xl border p-6 flex-1 space-y-4 max-w-2xl w-full mx-auto">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-80 max-w-full" />
          </div>
          <Skeleton className="h-64 w-full rounded-md" />
          <div className="flex items-center gap-2 pt-1">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
        <div className="shrink-0 max-w-2xl w-full mx-auto">
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      </main>
    </div>
  )
}
