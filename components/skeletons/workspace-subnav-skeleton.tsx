import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton counterpart of the project workspace sub-sidebar
 * (`components/workspace/project-workspace.tsx` → inline `SubNav`).
 *
 * Mirrors the dual layout:
 *   - Mobile  (< md): horizontal scrollable pill row with 5 icon+label pills
 *   - Desktop (md+): sticky vertical stack (`md:top-[120px]`) inside an
 *     `<aside>` with `md:h-[calc(100vh-120px)]` and `md:overflow-y-auto` so
 *     the sidebar stays visible while the page content scrolls independently
 *
 * `collapsed` mirrors the parent's desktop collapse state — when true,
 * the aside shrinks to `md:w-14` and only icon placeholders show.
 */
export function WorkspaceSubnavSkeleton({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div
      className={`relative sticky top-0 z-20 shrink-0 md:sticky md:top-[120px] md:self-start md:h-[calc(100vh-120px)] md:overflow-y-auto transition-all duration-200 ${
        collapsed ? 'md:w-14' : 'md:w-48'
      }`}
    >
      {/* Right-edge fade gradient — mobile only */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent md:hidden"
      />

      <aside
        aria-busy
        className={[
          'shrink-0 border-border bg-background h-full flex flex-col',
          'w-full border-b px-2 py-2 overflow-x-auto scrollbar-none',
          'md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r md:pt-4 md:pb-0',
          collapsed ? 'md:px-1' : 'md:px-3',
        ].join(' ')}
      >
        {/* Collapse toggle chevron — desktop only */}
        <div className="hidden md:flex mb-3 justify-end">
          <Skeleton className="h-6 w-6 rounded" />
        </div>

        <nav
          aria-label="Section navigation"
          className="flex flex-row gap-1 overflow-x-auto scrollbar-none md:flex-col md:overflow-x-visible md:overflow-y-auto flex-1"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={[
                'flex shrink-0 items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium',
                // Mobile pill
                'flex-col gap-1 px-3 py-2 text-[11px] min-w-[60px] justify-center',
                // Desktop row — collapsed hides labels
                collapsed
                  ? 'md:flex-row md:gap-0 md:px-2 md:py-2.5 md:text-sm md:min-w-0 md:justify-center md:w-full'
                  : 'md:flex-row md:gap-3 md:px-3 md:py-2 md:text-sm md:min-w-0 md:justify-start',
              ].join(' ')}
            >
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <Skeleton className={`h-3 ${collapsed ? 'md:hidden' : 'md:w-24'} w-16`} />
            </div>
          ))}
        </nav>

        <div className="mt-auto hidden md:flex md:flex-col md:justify-center md:h-[var(--app-rail-footer-h)] md:shrink-0 border-t border-[var(--glass-border)] p-2">
          <div className={`flex ${collapsed ? 'justify-center' : 'justify-end'}`}>
            <Skeleton className="h-6 w-6 rounded" />
          </div>
        </div>
      </aside>
    </div>
  )
}
