import { Skeleton } from '@/components/ui/skeleton'
import {
  SettingsPageSkeleton,
  SettingsCard,
} from '@/components/skeletons/settings-page-skeleton'

export default function NotificationsSettingsLoading() {
  return (
    <SettingsPageSkeleton
      noPadding
      title="Notification preferences"
      description="Choose how you want to be notified for each event category."
    >
      <SettingsCard>
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-background p-4">
            <div className="space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>

          <div className="overflow-hidden rounded-[var(--radius-md)] border border-border">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border bg-muted/40 px-4 py-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-12" />
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
                <Skeleton className="h-6 w-10 rounded-full" />
                <Skeleton className="h-6 w-10 rounded-full" />
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Skeleton className="h-10 w-40 rounded-md" />
          </div>
        </div>
      </SettingsCard>

      {/* Browser notifications card — mirrors second card which keeps its own CardHeader */}
      <SettingsCard>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-72" />
          </div>
          <Skeleton className="h-10 w-44 rounded-md" />
        </div>
      </SettingsCard>
    </SettingsPageSkeleton>
  )
}
