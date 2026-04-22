import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Shared EmptyState pattern (Phase 9 Pillar C).
 *
 * Preserves the prop surface from the original dashboard EmptyState
 * (per STATE.md Phase 03 decision: "EmptyState extended with onAction
 * callback prop for non-link button actions"), so call-sites can migrate
 * by changing only the import path.
 */
interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  /** External href — renders the action as a Link button. */
  actionHref?: string
  /** Click handler — renders the action as a button. Ignored if actionHref is set. */
  onAction?: () => void
  /** Optional secondary "Clear filters" button. */
  onClearFilter?: () => void
  /** Alias for actionHref — kept for parity with new call-sites in 09-08. */
  href?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  onClearFilter,
  href,
}: EmptyStateProps) {
  const link = actionHref ?? href

  return (
    <div className="flex flex-col items-center text-center gap-3 py-12">
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-full)] bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}

      <h3 className="text-lg font-[var(--font-weight-semibold)] tracking-[var(--tracking-tight)]">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      )}

      {actionLabel && link && (
        <Button asChild>
          <Link href={link}>{actionLabel}</Link>
        </Button>
      )}

      {actionLabel && onAction && !link && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}

      {onClearFilter && (
        <Button variant="ghost" onClick={onClearFilter} className="mt-2">
          Clear filters
        </Button>
      )}
    </div>
  )
}
