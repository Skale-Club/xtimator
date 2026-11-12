'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { BreadcrumbItem } from '@/components/app-shell/breadcrumb-context'

/**
 * In-page breadcrumb shown above a detail page's title on mobile only.
 * The mobile header always shows the app name (no page context), and the
 * desktop topbar already renders the same trail, hence `md:hidden`.
 * Parent links are muted; the last item is the current page.
 */
export function PageBreadcrumb({
  items,
  className,
}: {
  items: BreadcrumbItem[]
  className?: string
}) {
  const { t } = useTranslation()
  if (items.length === 0) return null

  return (
    <nav
      aria-label={t('Breadcrumb')}
      data-testid="page-breadcrumb"
      className={cn('flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground md:hidden', className)}
    >
      {items.map((crumb, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={i} className={cn('flex items-center gap-1.5', isLast ? 'min-w-0' : 'shrink-0')}>
            {i > 0 && <span aria-hidden>/</span>}
            {crumb.href && !isLast ? (
              <Link href={crumb.href} className="transition-colors hover:text-foreground">
                {t(crumb.label)}
              </Link>
            ) : (
              <span aria-current={isLast ? 'page' : undefined} className="truncate">
                {crumb.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
