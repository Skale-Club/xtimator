import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton counterpart of the admin vertical sidebar
 * (`components/admin/admin-nav.tsx`).
 *
 * Mirrors the layout:
 *   - Branding header (logo + "AppName Admin")
 *   - 12 nav rows: lucide icon (16px) + label, one of which gets the
 *     active gradient bar on the left edge
 *
 * Fixed `w-[240px]`, `h-full`, `bg-[var(--glass-bg)]`, and inner
 * `overflow-y-auto` so the sidebar scrolls on its own if the list ever
 * exceeds the viewport.
 */
export function AdminSubnavSkeleton() {
  return (
    <nav
      aria-label="Platform admin navigation"
      aria-busy
      className="w-[240px] flex-shrink-0 border-r border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] flex flex-col h-full overflow-y-auto"
    >
      {/* Branding header */}
      <div className="px-4 pt-6 pb-6 flex items-center gap-2">
        <Skeleton className="h-10 w-10 rounded" />
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
        </div>
      </div>

      {/* Nav rows */}
      <ul className="flex-1 flex flex-col gap-1 px-2 pb-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <li
            key={i}
            className="relative flex items-center gap-3 h-[40px] px-4 rounded-md"
          >
            <Skeleton className="h-4 w-4 shrink-0 rounded" />
            <Skeleton className="h-3 w-24" />
          </li>
        ))}
      </ul>
    </nav>
  )
}
