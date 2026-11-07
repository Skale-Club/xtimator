import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { SETTINGS_CARD_CLASS } from '@/components/settings/settings-ui'

interface SettingsPageSkeletonProps {
  title?: string
  description?: string
  children?: ReactNode
  /** Kept for old call sites. The settings layout owns the page padding now,
   *  so the skeleton never adds any. */
  noPadding?: boolean
}

/** Loading state for every settings page: the same header and cards as the
 *  real pages (components/settings/settings-ui.tsx). */
export function SettingsPageSkeleton({ title, description, children }: SettingsPageSkeletonProps) {
  return (
    <div className="space-y-6">
      <SettingsHeader title={title} description={description} />
      {children ?? (
        <SettingsCard title>
          <SkeletonFields count={4} />
        </SettingsCard>
      )}
    </div>
  )
}

interface SettingsHeaderProps {
  title?: string
  description?: string
}

export function SettingsHeader({ title, description }: SettingsHeaderProps) {
  return (
    <header className="space-y-1">
      {title ? (
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      ) : (
        <Skeleton className="h-8 w-40" />
      )}
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : (
        <Skeleton className="h-4 w-72 max-w-full" />
      )}
    </header>
  )
}

interface SettingsCardProps {
  children?: ReactNode
  className?: string
  /** Draw the card's title bar. */
  title?: boolean
}

/** Skeleton of components/settings/settings-ui.tsx's SettingsCard. */
export function SettingsCard({ children, className, title }: SettingsCardProps) {
  return (
    <div className={cn(SETTINGS_CARD_CLASS, className)}>
      {title && (
        <div className="space-y-2 border-b border-[var(--glass-border)] px-5 py-4 sm:px-6">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      )}
      {children && <div className="px-5 py-5 sm:px-6">{children}</div>}
    </div>
  )
}

/** Label + input pairs in a two-column grid. */
export function SkeletonFields({ count = 2, tall }: { count?: number; tall?: boolean }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className={cn('w-full rounded-md', tall ? 'h-28' : 'h-10')} />
        </div>
      ))}
    </div>
  )
}

/** Switch rows (label + help text, switch on the right). */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="divide-y divide-[var(--glass-border)]">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="h-6 w-10 rounded-full" />
        </div>
      ))}
    </div>
  )
}

interface SettingsSectionProps {
  title?: string
  description?: string
}

/** Section heading inside a skeleton card. */
export function SettingsSection({ title, description }: SettingsSectionProps) {
  return (
    <div>
      {title ? <h3 className="text-sm font-medium">{title}</h3> : <Skeleton className="h-5 w-32" />}
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : (
        <Skeleton className="mt-1 h-4 w-48" />
      )}
    </div>
  )
}
