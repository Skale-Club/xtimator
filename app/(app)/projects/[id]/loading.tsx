import { Skeleton } from '@/components/ui/skeleton'
import { WorkspaceSubnavSkeleton } from '@/components/skeletons/workspace-subnav-skeleton'

export default function ProjectLoading() {
  return (
    <div className="flex min-h-full flex-col">
      {/* Header skeleton — mirrors ProjectHeader (title + segmented status pill + client line) */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-4 pb-3 pt-4 md:px-6">
        <div className="flex items-center gap-3 flex-wrap justify-between">
          <div className="space-y-2 min-w-0">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-56 md:w-72" />
          </div>
          <Skeleton className="h-7 w-56 rounded-md" />
        </div>
        <Skeleton className="mt-2 h-4 w-40" />
      </header>

      <div className="flex min-h-full flex-col md:flex-row">
        <WorkspaceSubnavSkeleton />

        {/* Content skeleton — mirrors OverviewTab → EstimateEditor surface */}
        <div className="min-w-0 flex-1 px-4 py-6 md:px-6 space-y-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-start justify-between gap-4 p-5">
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-12 w-12 rounded-md" />
            </div>
            <Skeleton className="h-10 w-full rounded-none" />
            <div className="p-5 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-3 w-44" />
            </div>
            <div className="px-5 pb-5 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-9/12" />
            </div>
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
            <div className="border-t border-border px-5 py-4 space-y-2">
              {Array.from({ length: 3 }).map((_, t) => (
                <div key={t} className="flex justify-end gap-6">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating action bar skeleton — desktop pill */}
      <div className="sticky bottom-6 z-40 hidden md:flex justify-center pointer-events-none">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-background/95 p-1.5 shadow-xl backdrop-blur">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
        </div>
      </div>
    </div>
  )
}
