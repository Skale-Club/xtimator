import { Skeleton } from '@/components/ui/skeleton'
import { SettingsShellSkeleton } from '@/components/skeletons/settings-shell-skeleton'

/**
 * /settings/billing — mirrors the BillingPage layout:
 * - Hero section with title + subtitle
 * - Current plan + usage cards
 * - Tier cards grid (Free / Pro / Business)
 */
export default function BillingSettingsLoading() {
  return (
    <SettingsShellSkeleton>
      <div className="space-y-12 pb-12">
        <section className="relative isolate px-6 py-6 text-center">
          <div aria-hidden className="absolute inset-0 -z-10 gradient-hero" />
          <Skeleton className="mx-auto h-12 w-48" />
          <Skeleton className="mx-auto mt-3 h-4 w-96 max-w-full" />
        </section>

        <div className="w-full space-y-8 px-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="w-full rounded-[var(--radius-md)] border bg-card p-6 text-card-foreground shadow-sm"
              >
                <div className="flex items-start gap-3 border-b border-border pb-4">
                  <Skeleton className="h-5 w-5 rounded" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
                <div className="space-y-3 px-0 pt-4">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <Skeleton className="h-7 w-48" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="relative flex flex-col gap-5 rounded-[var(--radius-md)] border bg-card p-6 text-card-foreground shadow-sm"
                >
                  {i === 1 && (
                    <div className="absolute -top-3 left-1/2 h-5 w-24 -translate-x-1/2 rounded-full bg-muted" />
                  )}
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-10 w-28" />
                  <div className="flex-1 space-y-2">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} className="flex items-center gap-2">
                        <Skeleton className="h-3 w-3 rounded-full" />
                        <Skeleton className="h-3 flex-1" />
                      </div>
                    ))}
                  </div>
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SettingsShellSkeleton>
  )
}
