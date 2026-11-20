'use client'

import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'

export type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'declined'

interface StatusInput {
  sentAt?: string | null
  viewCount?: number
  clientResponse?: string | null
}

/**
 * Where the estimate stands with the client. Copying the share link does not
 * set sent_at, but a view proves it was shared, so views count as "sent".
 */
export function deriveEstimateStatus(i: StatusInput): EstimateStatus {
  if (i.clientResponse === 'accepted') return 'accepted'
  if (i.clientResponse === 'declined') return 'declined'
  if (i.sentAt || (i.viewCount ?? 0) > 0) return 'sent'
  return 'draft'
}

function shortDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const TONE: Record<EstimateStatus, { pill: string; dot: string }> = {
  draft: { pill: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/60' },
  sent: { pill: 'bg-primary/10 text-primary', dot: 'bg-primary' },
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
  sentAt,
  viewCount = 0,
  clientResponse,
  respondedAt,
  onClick,
  locked = false,
}: EstimateStatusChipProps) {
  const { t } = useTranslation()
  const status = deriveEstimateStatus({ sentAt, viewCount, clientResponse })
  const date = shortDate(respondedAt)
  const showLock = locked && status !== 'declined'

  let label: string
  if (status === 'draft') label = locked ? t('Locked') : t('Draft')
  else if (status === 'accepted') label = date ? `${t('Accepted')} · ${date}` : t('Accepted')
  else if (status === 'declined') label = date ? `${t('Declined')} · ${date}` : t('Declined')
  else if (sentAt) label = viewCount > 0 ? `${t('Sent')} · ${t('viewed')} ${viewCount}×` : t('Sent')
  else label = `${t('Viewed')} ${viewCount}×`

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
