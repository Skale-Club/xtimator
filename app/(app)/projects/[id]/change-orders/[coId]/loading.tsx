import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors the change order editor: top bar rows, then the paper. */
export default function ChangeOrderLoading() {
  return (
    <div data-editor-frame="v2" className="flex min-h-full flex-col">
      <div className="border-b border-border bg-background">
        <div className="flex min-h-[34px] items-center px-3 sm:px-5 md:px-6">
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex items-center justify-between gap-3 px-3 pb-0.5 pt-1 sm:px-5 md:px-6 md:py-1.5">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-6 w-20" />
        </div>
        <div className="px-3 pb-2 pt-1 sm:px-5 md:px-6">
          <Skeleton className="h-3.5 w-56" />
        </div>
      </div>
      <div className="px-3 pt-3 pb-5 sm:px-5 md:px-6 md:pt-5">
        <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-start justify-between gap-4 p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-12 w-12 rounded-md" />
          </div>
          <Skeleton className="h-10 w-full rounded-none" />
          <div className="space-y-3 p-5">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-16 w-full" />
          </div>
          <Skeleton className="h-9 w-full rounded-none" />
          <div className="space-y-3 p-5">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
