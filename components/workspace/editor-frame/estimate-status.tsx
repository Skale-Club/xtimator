'use client'

import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'

/**
 * Where the estimate stands, told only by what the client did. There is no
 * draft / shared state: the link works from the first minute and content only
 * locks when the client answers (owner decision 2026-11-21).
 */
export type EstimateStatus = 'unopened' | 'viewed' | 'accepted' | 'declined'

interface StatusInput {
  /** Kept for callers; no longer changes the status (send events live in the analytics timeline). */
  sentAt?: string | null
  viewCount?: number
  clientResponse?: string | null
}

export function deriveEstimateStatus(i: StatusInput): EstimateStatus {
  if (i.clientResponse === 'accepted') return 'accepted'
  if (i.clientResponse === 'declined') return 'declined'
  if ((i.viewCount ?? 0) > 0) return 'viewed'
  return 'unopened'
}

function shortDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const TONE: Record<EstimateStatus, { pill: string; dot: string }> = {
  unopened: { pill: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/60' },
  viewed: { pill: 'bg-primary/10 text-primary', dot: 'bg-primary' },
  accepted: { pill: 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]', dot: 'bg-[hsl(var(--success))]' },
  declined: { pill: 'bg-[hsl(var(--destructive-text)/0.12)] text-[hsl(var(--destructive-text))]', dot: 'bg-[hsl(var(--destructive-text))]' },
}

interface EstimateStatusChipProps extends StatusInput {
  respondedAt?: string | null
  onClick?: () => void
  /** Content lock (accepted, or signed and waiting): a lock replaces the dot.
   *  A declined estimate keeps its dot: it can be reopened. */
  locked?: boolean
}

export function EstimateStatusChip({
  viewCount = 0,
  clientResponse,
  respondedAt,
  onClick,
  locked = false,
}: EstimateStatusChipProps) {
  const { t } = useTranslation()
  const status = deriveEstimateStatus({ viewCount, clientResponse })
  const date = shortDate(respondedAt)
  const showLock = locked && status !== 'declined'

  let label: string
  if (status === 'accepted') label = date ? `${t('Accepted')} · ${date}` : t('Accepted')
  else if (status === 'declined') label = date ? `${t('Declined')} · ${date}` : t('Declined')
  else if (status === 'viewed') label = `${t('Viewed')} ${viewCount}×`
  else label = locked ? t('Locked') : t('Not opened yet')

  const tone = TONE[status]
  const className = cn(
    'relative inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-medium',
    tone.pill,
  )
  const content = (
    <>
      {showLock ? (
        <Lock aria-hidden className="size-3 shrink-0" data-testid="estimate-status-lock" />
      ) : (
        <span aria-hidden className={cn('size-[7px] shrink-0 rounded-full', tone.dot)} />
      )}
      {label}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${t('Estimate status')}: ${label}`}
        className={cn(className, "after:absolute after:-inset-2 after:content-['']")}
      >
        {content}
      </button>
    )
  }
  return <span className={className}>{content}</span>
}
