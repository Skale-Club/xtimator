import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-8 w-32" />

        <div className="rounded-xl border p-6 space-y-4">
          <Skeleton className="h-6 w-40" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        </div>

        <div className="rounded-xl border p-6 space-y-4">
          <Skeleton className="h-6 w-36" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        </div>

        <div className="rounded-xl border p-6 space-y-3">
          <Skeleton className="h-6 w-32" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-6 w-10 rounded-full" />
            </div>
          ))}
        </div>

        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    </div>
  )
}
