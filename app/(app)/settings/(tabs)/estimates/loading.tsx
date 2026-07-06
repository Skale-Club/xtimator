import { Skeleton } from '@/components/ui/skeleton'
import {
  SettingsPageSkeleton,
  SettingsCard,
} from '@/components/skeletons/settings-page-skeleton'

export default function EstimatesSettingsLoading() {
  return (
    <SettingsPageSkeleton
      noPadding
      title="Estimates"
      description="Set estimate defaults and delivery options."
    >
      <SettingsCard>
        <div className="space-y-8">
          <div className="grid gap-6 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-28 w-full rounded-md" />
              </div>
            ))}
          </div>

          <Skeleton className="h-10 w-44 rounded-md" />
        </div>
      </SettingsCard>

      {/* Estimate Terms skeleton */}
      <SettingsCard>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-border p-4">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
          <Skeleton className="h-10 w-40 rounded-md" />
        </div>
      </SettingsCard>
    </SettingsPageSkeleton>
  )
}
