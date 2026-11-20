import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/*
 * Settings building blocks. Every settings page is a SettingsHeader followed
 * by one or more SettingsCards, so the pages share one title size, one card
 * style and one place for the save action. The page width and padding come
 * from the settings layout (settings-layout-client.tsx), never from the page.
 */

export function SettingsHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  /** Page-level buttons, right of the title on wide screens. */
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

/** The page body: header + cards with one consistent gap. */
export function SettingsStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-6', className)}>{children}</div>
}

export const SETTINGS_CARD_CLASS =
  'overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-glass backdrop-blur-[var(--glass-blur)]'

export function SettingsCard({
  title,
  description,
  action,
  children,
  footer,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode
  description?: ReactNode
  /** Small control right of the card title (a link, a badge). */
  action?: ReactNode
  children?: ReactNode
  /** Bottom bar, right-aligned (save buttons). */
  footer?: ReactNode
  className?: string
  bodyClassName?: string
  id?: string
}) {
  const hasBody = (children !== undefined && children !== null && children !== false) || !!footer
  return (
    <section id={id} className={cn(SETTINGS_CARD_CLASS, className)}>
      {(title || description || action) && (
        <div
          className={cn(
            'flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6',
            hasBody && 'border-b border-[var(--glass-border)]',
          )}
        >
          <div className="min-w-0 space-y-1">
            {title && <h2 className="text-base font-semibold leading-tight">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children !== undefined && children !== null && children !== false && (
        <div className={cn('px-5 py-5 sm:px-6', bodyClassName)}>{children}</div>
      )}
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--glass-border)] bg-[var(--glass-bg-light)] px-5 py-3 sm:px-6">
          {footer}
        </div>
      )}
    </section>
  )
}

/**
 * One setting on one line: label and help text on the left, its control on
 * the right. Stack several inside a card body with `divide-y` (SettingsRows).
 */
export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode
  description?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0', className)}>
      <label htmlFor={htmlFor} className="min-w-0 flex-1 space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-sm text-muted-foreground">{description}</span>}
      </label>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function SettingsRows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('divide-y divide-[var(--glass-border)]', className)}>{children}</div>
}

/** The save action for edit forms; see settings-save-bar.tsx. */
export { SettingsSaveBar } from '@/components/settings/settings-save-bar'
