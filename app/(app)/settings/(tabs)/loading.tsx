import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsTabsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Skeleton className="h-8 w-48 rounded-md" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  )
}
