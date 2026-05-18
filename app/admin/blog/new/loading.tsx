import { Skeleton } from '@/components/ui/skeleton'

export default function NewPostLoading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-9 w-44 animate-pulse bg-[var(--glass-bg)]" />
      <Skeleton className="h-64 w-full animate-pulse bg-[var(--glass-bg)] rounded-xl" />
    </div>
  )
}
