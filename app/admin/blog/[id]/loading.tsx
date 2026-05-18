import { Skeleton } from '@/components/ui/skeleton'

export default function EditPostLoading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-9 w-40 animate-pulse bg-[var(--glass-bg)]" />
      <Skeleton className="h-64 w-full animate-pulse bg-[var(--glass-bg)] rounded-xl" />
    </div>
  )
}
