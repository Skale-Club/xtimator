import { Skeleton } from '@/components/ui/skeleton'

export default function EstimateTemplatesLoading() {
  return (
    <div className="w-full max-w-none space-y-6">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="rounded-[var(--radius-md)] border p-6 space-y-8">
        <div className="space-y-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
    </div>
  )
}
