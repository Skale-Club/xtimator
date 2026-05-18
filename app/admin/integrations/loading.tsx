import { Skeleton } from '@/components/ui/skeleton'

export default function IntegrationsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-96 animate-pulse bg-[var(--glass-bg)]" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full animate-pulse bg-[var(--glass-bg)] rounded-xl" />
        <Skeleton className="h-24 w-full animate-pulse bg-[var(--glass-bg)] rounded-xl" />
      </div>
    </div>
  )
}
