import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton counterpart of the vertical Settings sub-sidebar
 * (`components/settings/settings-nav.tsx` → `SubNav`).
 *
 * Mirrors the dual layout: mobile = horizontal scrollable pill row,
 * desktop = vertical column inside an `<aside>` (`md:w-52`) that is
 * sticky at `top-16` while the page content scrolls independently.
 *
 * Use inside any `/settings/*` loading.tsx so the sub-nav stays in place
 * during the page data fetch.
 */
export function SettingsSubnavSkeleton({ itemCount = 11 }: { itemCount?: number }) {
  return (
    <nav
      aria-label="Section navigation"
      aria-busy
      className="flex h-full flex-row gap-1 overflow-x-auto scrollbar-none md:flex-col md:overflow-x-visible md:overflow-y-auto"
    >
      {Array.from({ length: itemCount }).map((_, i) => (
        <div
          key={i}
          className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] px-3 py-2 min-w-[60px] md:flex-row md:gap-3 md:px-3 md:py-2 md:min-w-0 md:justify-start"
        >
          {/* Icon placeholder — square like lucide's h-4 w-4 */}
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
          {/* Label placeholder — narrower than full width to match the real text */}
          <Skeleton className="h-3 w-16 md:w-24" />
        </div>
      ))}
    </nav>
  )
}
