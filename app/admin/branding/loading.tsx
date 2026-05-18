import { Skeleton } from '@/components/ui/skeleton'

export default function BrandingLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-32 animate-pulse bg-[var(--glass-bg)]" />
        <Skeleton className="h-4 w-72 animate-pulse bg-[var(--glass-bg)]" />
      </div>
      <Skeleton className="h-72 w-full animate-pulse bg-[var(--glass-bg)] rounded-xl" />
    </div>
  )
}
