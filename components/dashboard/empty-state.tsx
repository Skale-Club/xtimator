import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
  onClearFilter?: () => void
}

/**
 * Phase 71 — Empty state with gradient-brand circle icon accent
 * (Pattern 6 in UI-SPEC). 48px circle, lucide icon, brand gradient bg.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  onClearFilter,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center max-w-md mx-auto">
      <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full gradient-brand shadow-glow-brand">
        <Icon className="h-6 w-6 text-white" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6">{description}</p>

      {actionLabel && actionHref && (
        <Button variant="primary" asChild>
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}

      {actionLabel && onAction && !actionHref && (
        <Button variant="primary" onClick={onAction}>{actionLabel}</Button>
      )}

      {onClearFilter && (
        <Button variant="ghost" onClick={onClearFilter} className="mt-2">
          Clear filters
        </Button>
      )}
    </div>
  )
}
