import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton counterpart of the vertical Settings sub-sidebar
 * (`components/settings/settings-nav.tsx` → `SubNav` in `alwaysVertical` mode).
 *
 * Mirrors the real rail: a vertical list of icon + label rows at ALL
 * breakpoints, inside an `<aside>` (`w-52`) that is a viewport-height,
 * self-scrolling sticky column while the page content scrolls independently.
 *
 * Use inside any `/settings/*` loading.tsx so the sub-nav stays in place
 * during the page data fetch.
 */
export function SettingsSubnavSkeleton({ itemCount = 11 }: { itemCount?: number }) {
  return (
    <nav
      aria-label="Section navigation"
      aria-busy
      className="flex flex-col gap-1 flex-1"
    >
      {Array.from({ length: itemCount }).map((_, i) => (
        <div
          key={i}
          className="flex shrink-0 flex-row items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 min-w-0 justify-start"
        >
          {/* Icon placeholder — square like lucide's h-4 w-4 */}
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
          {/* Label placeholder — narrower than full width to match the real text */}
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </nav>
  )
}
