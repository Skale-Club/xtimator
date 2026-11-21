import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton counterpart of the Settings side-panel list
 * (`components/settings/settings-nav.tsx` -> `SidePanelColumn`, `w-60`).
 *
 * Mirrors the real list: small group headings over icon + label rows. The
 * shell skeleton supplies the column frame (header row, border, sticky).
 *
 * Use inside any `/settings/*` loading.tsx so the sub-nav stays in place
 * during the page data fetch.
 */
export function SettingsSubnavSkeleton({ itemCount = 10 }: { itemCount?: number }) {
  const groupSizes = [3, 3, 3, 1]
  let remaining = itemCount
  return (
    <nav aria-label="Section navigation" aria-busy className="space-y-4">
      {groupSizes.map((size, g) => {
        const rows = Math.max(0, Math.min(size, remaining))
        remaining -= rows
        if (rows === 0) return null
        return (
          <div key={g} className="space-y-1">
            <Skeleton className="mx-3 mb-2 h-2.5 w-16" />
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="flex min-h-9 min-w-0 shrink-0 flex-row items-center gap-2 rounded-[var(--radius-md)] px-3">
                <Skeleton className="size-4 shrink-0 rounded" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        )
      })}
    </nav>
  )
}
