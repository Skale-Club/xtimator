import { Skeleton } from '@/components/ui/skeleton'

export default function AppearanceLoading() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="rounded-xl border p-6 space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-64" />
        <div className="flex gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-24 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  )
}
