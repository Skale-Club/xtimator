import { Skeleton } from '@/components/ui/skeleton'
import {
  SettingsPageSkeleton,
  SettingsCard,
} from '@/components/skeletons/settings-page-skeleton'

export default function BillingSettingsLoading() {
  return (
    <SettingsPageSkeleton
      title="Plans"
      description="You're on a plan. Choose the tier that fits your business — upgrade or downgrade anytime."
    >
      {/* Current plan + usage cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <SettingsCard key={i}>
            <div className="flex items-start gap-3 border-b border-border pb-4">
              <Skeleton className="h-5 w-5 rounded" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <div className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </SettingsCard>
        ))}
      </div>

      {/* Credits grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SettingsCard>
          <div className="flex items-start gap-3 border-b border-border pb-4">
            <Skeleton className="h-5 w-5 rounded" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
          <div className="space-y-3 pt-4">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-48" />
          </div>
        </SettingsCard>
        <SettingsCard>
          <div className="space-y-2 border-b border-border pb-4">
            <Skeleton className="h-5 w-36" />
          </div>
          <div className="space-y-3 pt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-2 w-20" />
                </div>
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </SettingsCard>
      </div>

      {/* Tier cards grid */}
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SettingsCard key={i}>
              <div className="flex flex-col gap-5">
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
            </SettingsCard>
          ))}
        </div>
      </div>

      {/* Manage subscription */}
      <SettingsCard>
        <div className="space-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-80" />
        </div>
        <div className="pt-4">
          <Skeleton className="h-10 w-48 rounded-md" />
        </div>
      </SettingsCard>
    </SettingsPageSkeleton>
  )
}
