import { Skeleton } from '@/components/ui/skeleton'
import { SettingsCard } from '@/components/skeletons/settings-page-skeleton'

export default function McpSettingsLoading() {
  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
        <Skeleton className="h-3 w-96 max-w-full" />
        <Skeleton className="h-3 w-32" />
      </header>

      <SettingsCard>
        <div className="space-y-1">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-72" />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Skeleton className="h-10 flex-1 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="space-y-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-96 max-w-full" />
        </div>
        <Skeleton className="h-10 w-48 rounded-md" />
      </SettingsCard>

      <SettingsCard>
        <div className="space-y-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-96 max-w-full" />
        </div>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-1.5 w-1.5 rounded-full" />
                <Skeleton className="h-3 w-full max-w-md" />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-1.5 w-1.5 rounded-full" />
                <Skeleton className="h-3 w-full max-w-md" />
              </div>
            ))}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <Skeleton className="h-5 w-28" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3 w-full max-w-lg" />
          <Skeleton className="h-3 w-3/4 max-w-md" />
        </div>
      </SettingsCard>
    </div>
  )
}
