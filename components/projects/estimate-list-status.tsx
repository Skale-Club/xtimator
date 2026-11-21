'use client'

import { Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'
import { formatDate } from '@/lib/utils/format-date'
import { fillTemplate, relativeTimeParts } from '@/lib/utils/relative-time-key'
import { INTEREST_REASON_LABELS } from '@/lib/estimate/analytics/contracts'
import type { EstimateListState, EstimateListStatus } from '@/lib/queries/estimate-list-status'

const TONE: Record<EstimateListState, string> = {
  unopened: 'bg-muted text-muted-foreground',
  viewed: 'bg-primary/10 text-primary',
  accepted: 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]',
  declined: 'bg-[hsl(var(--destructive-text)/0.12)] text-[hsl(var(--destructive-text))]',
}

const DOT: Record<EstimateListState, string> = {
  unopened: 'bg-muted-foreground/60',
  viewed: 'bg-primary',
  accepted: 'bg-[hsl(var(--success))]',
  declined: 'bg-[hsl(var(--destructive-text))]',
}

/** Translated "2h ago" / "Nov 6" for an ISO time. */
export function useRelativeLabel() {
  const { t } = useTranslation()
  return (iso: string | null | undefined): string => {
    if (!iso) return ''
    const parts = relativeTimeParts(iso)
    if (parts.key === null) return parts.date
    return fillTemplate(t(parts.key), { n: parts.n })
  }
}

/**
 * Projects list "Status" cell: Draft / Sent / Viewed 3× · 2h ago / Accepted ·
 * Nov 6 / Declined, plus a flame "Hot" marker when the client looks ready to
 * decide (the reasons are in its tooltip).
 */
export function EstimateListStatusPill({
  status,
  className,
}: {
  status: EstimateListStatus | null | undefined
  className?: string
}) {
  const { t } = useTranslation()
  const relative = useRelativeLabel()
  if (!status) return null

  let label: string
  if (status.state === 'accepted' || status.state === 'declined') {
    const name = status.state === 'accepted' ? t('Accepted') : t('Declined')
    const date = status.respondedAt ? formatDate(status.respondedAt, { month: 'short', day: 'numeric' }) : ''
    label = date ? `${name} · ${date}` : name
  } else if (status.state === 'viewed') {
    const ago = relative(status.lastViewedAt)
    label = `${t('Viewed')} ${status.views}×${ago ? ` · ${ago}` : ''}`
  } else label = t('Not opened yet')

  const hotTitle = status.hot
    ? [t('Hot'), ...status.hotReasons.map((r) => t(INTEREST_REASON_LABELS[r]))].join(' · ')
    : undefined

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)} data-testid="estimate-list-status">
      <span
        className={cn(
          'inline-flex h-6 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
          TONE[status.state],
        )}
      >
        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT[status.state])} />
        <span className="truncate whitespace-nowrap" suppressHydrationWarning>{label}</span>
      </span>
      {status.hot && (
        <span
          title={hotTitle}
          aria-label={hotTitle}
          data-testid="estimate-hot"
          className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full bg-orange-500/15 px-2 text-xs font-semibold text-orange-500"
        >
          <Flame className="size-3.5" aria-hidden />
          {t('Hot')}
        </span>
      )}
    </span>
  )
}
