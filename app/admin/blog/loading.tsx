import { Skeleton } from '@/components/ui/skeleton'

export default function BlogLoading() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Skeleton className="h-9 w-32 animate-pulse bg-[var(--glass-bg)]" />
          <Skeleton className="h-4 w-56 animate-pulse bg-[var(--glass-bg)]" />
        </div>
        <Skeleton className="h-9 w-24 animate-pulse bg-[var(--glass-bg)] rounded-lg" />
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full animate-pulse bg-[var(--glass-bg)] rounded-lg" />
        ))}
      </div>
    </div>
  )
}
