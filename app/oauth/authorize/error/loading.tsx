import { Skeleton } from '@/components/ui/skeleton'

export default function AuthorizeErrorLoading() {
  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <div className="rounded-lg border border-destructive/40 bg-card p-6 space-y-3">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-3 w-full max-w-md" />
        <Skeleton className="h-3 w-3/4 max-w-sm" />
      </div>
    </div>
  )
}
