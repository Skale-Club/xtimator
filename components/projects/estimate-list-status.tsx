'use client'

import { useState } from 'react'
import { BarChart3, Check, Flame, PenLine, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'
import { formatDate } from '@/lib/utils/format-date'
import { fillTemplate, relativeTimeParts } from '@/lib/utils/relative-time-key'
import { INTEREST_REASON_LABELS } from '@/lib/estimate/analytics/contracts'
import type { EstimateListState, EstimateListStatus } from '@/lib/queries/estimate-list-status'
import { EstimateAnalyticsDrawer } from '@/components/workspace/estimate/analytics/estimate-analytics-drawer'

/** Icon color and ring per state: grey not opened, blue opened, green accepted, red declined. */
const BUTTON_TONE: Record<EstimateListState, string> = {
  unopened: 'border-border text-muted-foreground/70',
  viewed: 'border-primary/40 text-primary',
  accepted: 'border-[hsl(var(--success)/0.5)] text-[hsl(var(--success))]',
  declined: 'border-[hsl(var(--destructive-text)/0.5)] text-[hsl(var(--destructive-text))]',
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

/** One line that says where the estimate stands, for the icon's tooltip and accessible name. */
export function useEstimateStatusSummary() {
  const { t } = useTranslation()
  const relative = useRelativeLabel()
  return (status: EstimateListStatus): string => {
    let main: string
    if (status.state === 'accepted' || status.state === 'declined') {
      const name = status.state === 'accepted' ? t('Accepted') : t('Declined')
      const date = status.respondedAt ? formatDate(status.respondedAt, { month: 'short', day: 'numeric' }) : ''
      main = date ? `${name} · ${date}` : name
    } else if (status.state === 'viewed') {
      const ago = relative(status.lastViewedAt)
      main = `${t('Viewed')} ${status.views}×${ago ? ` · ${ago}` : ''}`
    } else {
      main = t('Not opened yet')
    }
    const extra: string[] = []
    if (status.signStarted) extra.push(t('Started signing'))
    if (status.hot) {
      const reasons = status.hotReasons.map((r) => t(INTEREST_REASON_LABELS[r]))
      extra.push(reasons.length ? `${t('Hot')}: ${reasons.join(', ')}` : t('Hot'))
    }
    return [main, ...extra].join(' · ')
  }
}

/** Corner glyph, strongest first: the answer, then signing, then Hot. */
function cornerGlyph(status: EstimateListStatus): { Icon: typeof Check; tone: string; testId: string } | null {
  if (status.state === 'accepted') return { Icon: Check, tone: 'bg-[hsl(var(--success))]', testId: 'glyph-accepted' }
  if (status.state === 'declined') return { Icon: X, tone: 'bg-[hsl(var(--destructive-text))]', testId: 'glyph-declined' }
  if (status.signStarted) return { Icon: PenLine, tone: 'bg-amber-500', testId: 'glyph-signing' }
  if (status.hot) return { Icon: Flame, tone: 'bg-orange-500', testId: 'glyph-hot' }
  return null
}

/**
 * Projects list analytics button (beside the row menu, desktop and phone).
 * The icon's color is the state, the top badge counts opens and the bottom
 * glyph flags the strongest signal; a click opens the estimate's analytics
 * drawer over the list. Renders an empty slot when the project has no estimate
 * yet, so the row menus stay aligned.
 */
export function EstimateAnalyticsButton({
  status,
  clientName,
  className,
}: {
  status: EstimateListStatus | null | undefined
  clientName?: string | null
  className?: string
}) {
  const { t } = useTranslation()
  const summarize = useEstimateStatusSummary()
  const [open, setOpen] = useState(false)

  if (!status || !status.estimateId) return <span aria-hidden className={cn('inline-block size-9 shrink-0', className)} />

  const summary = summarize(status)
  const glyph = cornerGlyph(status)
  const showCount = status.state === 'viewed' && status.views > 0

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        title={summary}
        aria-label={`${t('Estimate analytics')}: ${summary}`}
        data-testid="estimate-analytics-button"
        data-state={status.state}
        className={cn(
          'relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border bg-background transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          BUTTON_TONE[status.state],
          className,
        )}
      >
        <BarChart3 className="size-4" aria-hidden />
        {showCount && (
          <span
            aria-hidden
            data-testid="estimate-analytics-count"
            className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10.5px] font-semibold leading-none text-primary-foreground tabular-nums"
          >
            {status.views > 99 ? '99+' : status.views}
          </span>
        )}
        {glyph && (
          <span
            aria-hidden
            data-testid={glyph.testId}
            className={cn(
              'absolute -bottom-1 -right-1.5 flex size-[17px] items-center justify-center rounded-full text-white ring-2 ring-background',
              glyph.tone,
            )}
          >
            <glyph.Icon className="size-2.5" strokeWidth={3} />
          </span>
        )}
      </button>
      {open && (
        <EstimateAnalyticsDrawer open={open} onOpenChange={setOpen} estimateId={status.estimateId} clientName={clientName ?? null} />
      )}
    </>
  )
}
