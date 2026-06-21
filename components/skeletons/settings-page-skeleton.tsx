import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface SettingsPageSkeletonProps {
  title?: string
  description?: string
  children?: ReactNode
  noPadding?: boolean
}

/**
 * Reusable skeleton for all settings pages.
 * Use `noPadding` for pages inside the `(tabs)` route group — their layout
 * already provides `p-6`, so adding it here would double the padding.
 */
export function SettingsPageSkeleton({
  title,
  description,
  children,
  noPadding,
}: SettingsPageSkeletonProps) {
  return (
    <div className={noPadding ? 'space-y-6' : 'space-y-6 p-6'}>
      <SettingsHeader title={title} description={description} />
      {children}
    </div>
  )
}

interface SettingsHeaderProps {
  title?: string
  description?: string
}

export function SettingsHeader({ title, description }: SettingsHeaderProps) {
  return (
    <header className="flex flex-col gap-1">
      {title ? (
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">{title}</h1>
      ) : (
        <Skeleton className="h-9 w-40" />
      )}
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : (
        <Skeleton className="h-4 w-72" />
      )}
    </header>
  )
}

interface SettingsCardProps {
  children: ReactNode
  className?: string
}

/**
 * Skeleton card that visually matches `<Card className="w-full rounded-[var(--radius-md)]">`.
 */
export function SettingsCard({ children, className }: SettingsCardProps) {
  return (
    <div
      className={cn(
        'w-full rounded-[var(--radius-md)] border bg-card p-6 text-card-foreground shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface SettingsSectionProps {
  title?: string
  description?: string
}

/**
 * Left-hand section explainer used inside two-column settings cards.
 */
export function SettingsSection({ title, description }: SettingsSectionProps) {
  return (
    <div>
      {title ? (
        <h3 className="text-sm font-medium">{title}</h3>
      ) : (
        <Skeleton className="h-5 w-32" />
      )}
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : (
        <Skeleton className="mt-1 h-4 w-48" />
      )}
    </div>
  )
}
