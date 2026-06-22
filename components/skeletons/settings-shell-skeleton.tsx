import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsSubnavSkeleton } from '@/components/skeletons/settings-subnav-skeleton'

/**
 * Wrapper shared by all `/settings/*` and `/settings/(tabs)/*` loading.tsx.
 * Renders the Settings sub-sidebar skeleton next to the page's content skeleton
 * so the sub-nav stays in place during a route transition.
 *
 * Layout mirrors `app/(app)/settings/layout.tsx`:
 *   - h-full wrapper so the layout fills the parent main scroll container
 *   - sticky desktop sidebar (top-16) with its own overflow-y-auto
 *   - mobile keeps the horizontal sticky strip
 */
export function SettingsShellSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 min-h-0 flex-col md:flex-row md:gap-0">
        <div className="relative sticky top-0 z-20 shrink-0 md:sticky md:top-16 md:z-auto md:h-[calc(100vh-4rem)] md:overflow-y-auto md:w-52 md:self-start">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent md:hidden"
          />
          <aside className="shrink-0 border-border bg-background h-full w-full border-b px-2 py-2 overflow-x-auto scrollbar-none md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:pt-8 md:pb-0 flex flex-col">
            <div className="flex-1">
              <SettingsSubnavSkeleton />
            </div>
            <div className="mt-auto hidden md:flex md:flex-col md:justify-center md:h-[var(--app-rail-footer-h)] md:shrink-0 border-t border-[var(--glass-border)] p-2">
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
