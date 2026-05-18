import { Skeleton } from '@/components/ui/skeleton'

export default function BillingLoading() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-24 animate-pulse bg-[var(--glass-bg)]" />
        <Skeleton className="h-4 w-80 animate-pulse bg-[var(--glass-bg)]" />
      </div>
      <Skeleton className="min-h-[120px] max-w-sm animate-pulse bg-[var(--glass-bg)] rounded-xl" />
      <Skeleton className="h-64 w-full animate-pulse bg-[var(--glass-bg)] rounded-xl" />
    </div>
  )
}
