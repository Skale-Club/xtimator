import { Skeleton } from '@/components/ui/skeleton'

export default function EstimateTemplatesLoading() {
  return (
    <div className="space-y-8 p-6">
      <header className="flex flex-col gap-1">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </header>

      <div className="rounded-[var(--radius-md)] border p-6 space-y-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-4 w-48" />
          </div>
        ))}
        <Skeleton className="h-10 w-40" />
      </div>
    </div>
  )
}
