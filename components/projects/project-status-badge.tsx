'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { EstimateListState } from '@/lib/queries/estimate-list-status'

const IN_PROGRESS_LABEL = 'In progress'
const IN_PROGRESS_STYLE =
  'bg-transparent text-blue-400 border border-blue-500/60'

const STATUS_LABEL: Record<string, string> = {
  estimate_ready: 'Estimate ready',
  // Credits plan 2026-11-20: a virtual status (lib/queries/credit-pauses.ts) -
  // the project's capture is paused waiting for a top-up.
  awaiting_credits: 'Paused: out of credits',
}

const STATUS_STYLES: Record<string, string> = {
  estimate_ready:
    'bg-green-500/15 text-green-400 border border-green-500/50',
  awaiting_credits:
    'bg-amber-500/10 text-amber-500 border border-amber-500/40',
}

// The estimate vocabulary (XTM-D-20261121-no-draft-state): only what the client did.
const ESTIMATE_STYLES: Record<EstimateListState, string> = {
  unopened: 'bg-muted text-muted-foreground border border-border',
  viewed: 'bg-primary/10 text-primary border border-primary/40',
  accepted: 'bg-green-500/15 text-green-400 border border-green-500/50',
  declined: 'bg-red-500/10 text-red-400 border border-red-500/40',
}

interface ProjectStatusBadgeProps {
  status: string
  /** The current estimate's client-side standing. Absent: the project has no estimate yet. */
  estimate?: { state: EstimateListState; views?: number } | null
}

/** The label the badge shows for an estimate state (same words as the editor's status chip). */
export function estimateStateLabel(
  state: EstimateListState,
  views: number | undefined,
  t: (text: string) => string,
): string {
  if (state === 'accepted') return t('Accepted')
  if (state === 'declined') return t('Declined')
  if (state === 'viewed') return `${t('Viewed')} ${Math.max(1, views ?? 1)}×`
  return t('Not opened yet')
}

export function ProjectStatusBadge({ status, estimate }: ProjectStatusBadgeProps) {
  const { t } = useTranslation()

  // Paused for credits wins: the owner has to act before anything else matters.
  if (estimate && status !== 'awaiting_credits') {
    return (
      <Badge variant="secondary" className={cn('hover:opacity-90', ESTIMATE_STYLES[estimate.state])}>
        {estimateStateLabel(estimate.state, estimate.views, t)}
      </Badge>
    )
  }

  const label = STATUS_LABEL[status] ?? IN_PROGRESS_LABEL
  const style = STATUS_STYLES[status] ?? IN_PROGRESS_STYLE

  return (
    <Badge variant="secondary" className={cn('hover:opacity-90', style)}>
      {t(label)}
    </Badge>
  )
}
