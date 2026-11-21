import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsSubnavSkeleton } from '@/components/skeletons/settings-subnav-skeleton'

/**
 * Wrapper shared by all `/settings/*` and `/settings/(tabs)/*` loading.tsx.
 * Renders the Settings sub-sidebar skeleton next to the page's content skeleton
 * so the sub-nav stays in place during a route transition.
 *
 * Layout mirrors `app/(app)/settings/layout.tsx` + `SettingsLayoutClient`:
 *   - h-full wrapper so the layout fills the parent main scroll container
 *   - md+: a w-60 side-panel column (sticky, full height under the top bar)
 *   - phone: the bar under the top bar with the full-width section picker
 *   - page content fills the space beside the column (flex-1 min-w-0)
 */
export function SettingsShellSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row md:items-start">
        <div className="sticky top-0 z-20 border-b border-border bg-background px-4 py-2.5 md:hidden">
          <Skeleton className="h-10 w-full rounded-[var(--radius-md)]" />
        </div>
        <aside className="sticky top-0 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 self-start flex-col overflow-y-auto border-r border-[var(--glass-border)] md:flex">
          <div className="flex h-11 shrink-0 items-center justify-between pl-4 pr-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
          <div className="px-3 pb-3">
            <SettingsSubnavSkeleton />
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          {children ?? <Skeleton className="h-64 w-full" />}
        </div>
      </div>
    </div>
  )
}
