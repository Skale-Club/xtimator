import { Skeleton } from '@/components/ui/skeleton'
import {
  SettingsPageSkeleton,
  SettingsCard,
} from '@/components/skeletons/settings-page-skeleton'

export default function DefaultsSettingsLoading() {
  return (
    <SettingsPageSkeleton
      noPadding
      title="Estimate Defaults"
      description="Set the reusable terms and calculation defaults applied when new estimates are created."
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
    </SettingsPageSkeleton>
  )
}
