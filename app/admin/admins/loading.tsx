import { Skeleton } from '@/components/ui/skeleton'

export default function AdminsLoading() {
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-40 animate-pulse bg-[var(--glass-bg)]" />
          <Skeleton className="h-4 w-72 animate-pulse bg-[var(--glass-bg)]" />
        </div>
        <Skeleton className="h-9 w-32 animate-pulse bg-[var(--glass-bg)] rounded-lg" />
      </div>
      <Skeleton className="h-48 w-full animate-pulse bg-[var(--glass-bg)] rounded-xl" />
    </div>
  )
}
