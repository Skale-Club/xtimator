import { Skeleton } from '@/components/ui/skeleton'
import {
  SettingsPageSkeleton,
  SettingsCard,
} from '@/components/skeletons/settings-page-skeleton'

export default function TeamSettingsLoading() {
  return (
    <SettingsPageSkeleton
      noPadding
      title="Team"
      description="People who can create clients and estimates. Their name appears as &ldquo;Prepared by&rdquo; on estimates they generate."
    >
      {/* Seat-cost summary */}
      <SettingsCard>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="sm:text-right space-y-1">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
      </SettingsCard>

      {/* Members list */}
      <SettingsCard>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 border-b border-border pb-4 last:border-b-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          ))}
        </div>
      </SettingsCard>
    </SettingsPageSkeleton>
  )
}
