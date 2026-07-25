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
 *   - a LEFT vertical rail (w-52) at ALL breakpoints — a viewport-height,
 *     self-scrolling sticky column with its own overflow-y-auto
 *   - page content fills the space beside the rail (flex-1 min-w-0)
 */
export function SettingsShellSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-row items-start">
        <div className="sticky top-0 shrink-0 self-start h-[calc(100vh-4rem)] overflow-y-auto w-52">
          <aside className="shrink-0 border-border bg-background h-full w-full flex flex-col overflow-y-auto scrollbar-none border-r px-3 pt-8 pb-0">
            <div className="flex-1">
              <SettingsSubnavSkeleton />
            </div>
            <div className="mt-auto flex flex-col justify-center h-[var(--app-rail-footer-h)] shrink-0 border-t border-[var(--glass-border)] p-2">
              <div className="flex justify-end">
                <Skeleton className="h-6 w-6 rounded" />
              </div>
            </div>
          </aside>
        </div>
        <div className="min-w-0 flex-1">
          {children ?? <Skeleton className="h-64 w-full" />}
        </div>
      </div>
    </div>
  )
}
