import { Skeleton } from '@/components/ui/skeleton'

/**
 * Loading skeleton for all 5 settings tab routes (company, defaults,
 * notifications, appearance, account). The layout (header + nav) renders
 * instantly; this fills the {children} slot until the tab data resolves.
 */
export default function SettingsTabsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48 rounded-md" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  )
}
