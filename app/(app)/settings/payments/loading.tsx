import { Skeleton } from '@/components/ui/skeleton'

export default function PaymentsSettingsLoading() {
  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-1">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-4 w-72" />
      </header>

      <div className="w-full rounded-[var(--radius-md)] border bg-card p-6 shadow-sm">
        <div className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full max-w-lg" />
            <Skeleton className="h-4 w-3/4 max-w-md" />
          </div>

          <Skeleton className="h-4 w-full max-w-sm" />

          <div className="rounded-md border-l-2 border-amber-500/60 pl-3 py-1 space-y-1">
            <Skeleton className="h-3 w-full max-w-md" />
            <Skeleton className="h-3 w-2/3 max-w-xs" />
          </div>

          <Skeleton className="h-10 w-48 rounded-md" />
        </div>
      </div>
    </div>
  )
}
