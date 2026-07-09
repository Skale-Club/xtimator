import { Skeleton } from '@/components/ui/skeleton'

export default function EstimateLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
      {/* Language chip placeholder (right-aligned) */}
      <div className="flex justify-end">
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>

      {/* Document card — mirrors the shared EstimateView document */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Company header */}
        <div className="flex items-start justify-between gap-4 p-5">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-12 w-12 rounded-md" />
        </div>

        {/* Brand band */}
        <Skeleton className="h-10 w-full rounded-none" />

        {/* Project block */}
        <div className="p-5 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-3 w-44" />
        </div>

        {/* Summary */}
        <div className="px-5 pb-5 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
        </div>

        {/* Sections */}
        {Array.from({ length: 2 }).map((_, s) => (
          <div key={s} className="border-t border-border px-5 py-4 space-y-3">
            <Skeleton className="h-4 w-44" />
            {Array.from({ length: 3 }).map((_, r) => (
              <div key={r} className="flex items-center gap-3">
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ))}

        {/* Totals */}
        <div className="border-t border-border px-5 py-4 space-y-2">
          {Array.from({ length: 3 }).map((_, t) => (
            <div key={t} className="flex justify-end gap-6">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Accept / decline actions */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-full max-w-md" />
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Skeleton className="h-11 flex-1 rounded-md" />
          <Skeleton className="h-11 flex-1 rounded-md" />
        </div>
      </div>
    </div>
  )
}
