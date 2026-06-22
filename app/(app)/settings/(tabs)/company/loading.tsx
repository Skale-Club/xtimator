import { Skeleton } from '@/components/ui/skeleton'
import {
  SettingsPageSkeleton,
  SettingsCard,
} from '@/components/skeletons/settings-page-skeleton'

export default function CompanySettingsLoading() {
  return (
    <SettingsPageSkeleton
      noPadding
      title="Company Information"
      description="Keep the business details that appear across estimates, client links, and generated documents up to date."
    >
      <SettingsCard>
        <div className="grid gap-8 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="flex items-center justify-center rounded-[var(--radius-md)] border border-dashed border-border bg-muted/30 p-6">
            <Skeleton className="h-32 w-32 rounded-full" />
          </div>

          <div className="space-y-8">
            <div className="grid gap-5 lg:grid-cols-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={cn('space-y-2', i < 2 && 'lg:col-span-2')}
                >
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-md" />
              <Skeleton className="h-4 w-24" />
            </div>

            <Skeleton className="h-10 w-44 rounded-md" />
          </div>
        </div>
      </SettingsCard>
    </SettingsPageSkeleton>
  )
}

function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(' ')
}
