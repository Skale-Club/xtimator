import { Skeleton } from '@/components/ui/skeleton'
import { SettingsPageSkeleton } from '@/components/skeletons/settings-page-skeleton'

export default function EstimateTemplatesLoading() {
  return (
    <SettingsPageSkeleton
      title="Message"
      description="Customize what clients see when you send them an estimate."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[var(--radius-md)] border bg-card p-6">
          <div className="space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-20 w-full rounded-md" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-24 rounded" />
                </div>
              </div>
            ))}
            <Skeleton className="h-10 w-40 rounded-md" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-64 w-full rounded-[var(--radius-md)]" />
        </div>
      </div>
    </SettingsPageSkeleton>
  )
}
