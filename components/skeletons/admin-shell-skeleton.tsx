import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { AdminSubnavSkeleton } from '@/components/skeletons/admin-subnav-skeleton'

/**
 * Wrapper shared by all `/admin/*` loading.tsx.
 * Mirrors the admin layout: Super-Admin banner + fixed 240px sub-sidebar +
 * topbar + main scroll container.
 */
export function AdminShellSkeleton({ children }: { children: ReactNode }) {
  return (
    <div
      data-theme="admin-dark"
      className="h-screen bg-background text-foreground flex flex-col overflow-hidden"
    >
      {/* Super Admin Mode banner */}
      <div className="flex items-center justify-center gap-2 bg-[hsl(var(--primary)/0.12)] border-b border-[hsl(var(--primary)/0.3)] px-4 py-1.5 text-xs font-medium text-[hsl(var(--primary))]">
        <Skeleton className="h-3.5 w-3.5 rounded animate-pulse bg-[var(--glass-bg)]" />
        <Skeleton className="h-3 w-72 animate-pulse bg-[var(--glass-bg)]" />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <AdminSubnavSkeleton />

        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Topbar skeleton */}
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-md animate-pulse bg-[var(--glass-bg)]" />
              <Skeleton className="h-4 w-32 animate-pulse bg-[var(--glass-bg)]" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-28 rounded-md animate-pulse bg-[var(--glass-bg)]" />
              <Skeleton className="h-7 w-7 rounded-full animate-pulse bg-[var(--glass-bg)]" />
            </div>
          </div>

          <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
        </div>
      </div>
    </div>
  )
}
