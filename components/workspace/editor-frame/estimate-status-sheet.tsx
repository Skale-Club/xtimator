'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  ClientResponseControl,
  type ClientResponseValue,
} from '@/components/workspace/estimate/client-response-control'
import { EngagementPanel } from '@/components/workspace/estimate/engagement-panel'
import { relativeTime } from '@/lib/utils/relative-time'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import { deriveEstimateStatus } from './estimate-status'

export interface EstimateStatusSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  estimateId: string
  createdAt: string
  sentAt: string | null
  viewCount: number
  lastViewedAt: string | null
  clientResponse: string | null
  respondedAt: string | null
  signedOnline: boolean
  /** Unsaved edits or a save in flight: recording an answer would lock content mid-save. */
  recordDisabled: boolean
  onRecord: (response: ClientResponseValue) => Promise<void>
}

function shortDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function TimelineLine({ lead, rest, tone = 'primary' }: { lead: string; rest?: string; tone?: 'primary' | 'success' | 'danger' }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={cn(
          'mt-[7px] size-2 shrink-0 rounded-full',
          tone === 'success' ? 'bg-[hsl(var(--success))]' : tone === 'danger' ? 'bg-[hsl(var(--destructive-text))]' : 'bg-primary',
        )}
      />
      <span className="min-w-0">
        <b className="font-semibold text-foreground">{lead}</b>
        {rest ? ` ${rest}` : ''}
      </span>
    </li>
  )
}

/**
 * The editor's status sheet: timeline of what happened to the estimate, the
 * place to record the client's answer, and the engagement details. Bottom sheet
 * on phones, centred card from sm up.
 */
export function EstimateStatusSheet({
  open,
  onOpenChange,
  estimateId,
  createdAt,
  sentAt,
  viewCount,
  lastViewedAt,
  clientResponse,
  respondedAt,
  signedOnline,
  recordDisabled,
  onRecord,
}: EstimateStatusSheetProps) {
  const { t } = useTranslation()
  const [showEngagement, setShowEngagement] = useState(false)

  useEffect(() => {
    if (!open) setShowEngagement(false)
  }, [open])

  const status = deriveEstimateStatus({ sentAt, viewCount, clientResponse })
  const answered = clientResponse === 'accepted' || clientResponse === 'declined'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'flex flex-col gap-0 overflow-hidden border-border bg-background p-0 backdrop-blur-none',
          // Phones: bottom sheet (full width, square bottom, safe-area padding).
          'top-auto bottom-0 left-0 max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-t-[28px] rounded-b-none pb-[env(safe-area-inset-bottom)]',
          // sm and up: centred card.
          'sm:top-[50%] sm:bottom-auto sm:left-[50%] sm:max-h-[85dvh] sm:max-w-[440px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[28px] sm:pb-0',
        )}
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border sm:hidden" />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <DialogTitle className="text-[19px] font-semibold leading-tight tracking-tight">
            {t('Estimate status')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('Estimate status')}
          </DialogDescription>

          <ul className="flex flex-col gap-2 text-[13.5px] text-muted-foreground">
            <TimelineLine lead={t('Created')} rest={shortDate(createdAt)} />
            {sentAt && <TimelineLine lead={t('Shared')} rest={shortDate(sentAt)} />}
            {viewCount > 0 && (
              <TimelineLine
                lead={`${t('Opened')} ${viewCount} ${viewCount === 1 ? t('time') : t('times')}`}
                rest={lastViewedAt ? `· ${relativeTime(lastViewedAt)}` : undefined}
              />
            )}
            {answered && (
              <TimelineLine
                lead={clientResponse === 'accepted' ? t('Accepted') : t('Declined')}
                rest={[shortDate(respondedAt), signedOnline ? `· ${t('Signed online')}` : '']
                  .filter(Boolean)
                  .join(' ')}
                tone={clientResponse === 'accepted' ? 'success' : 'danger'}
              />
            )}
          </ul>

          {status === 'draft' ? (
            <p className="text-[13.5px] text-muted-foreground">
              {t('Not shared yet. The client’s answer shows up here after you share the estimate.')}
            </p>
          ) : (
            <>
              {!signedOnline && (
                <p className="text-[13.5px] text-muted-foreground">
                  {t('Got the answer by phone or in person? Record it here.')}
                </p>
              )}
              <div className="flex">
                <ClientResponseControl
                  alwaysShowLabel
                  clientResponse={clientResponse}
                  respondedAt={respondedAt}
                  signedOnline={signedOnline}
                  disabled={recordDisabled}
                  onRecord={onRecord}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowEngagement((v) => !v)}
                aria-expanded={showEngagement}
                className="h-11 w-full rounded-full bg-primary/10 text-sm font-semibold text-primary"
              >
                {t('View engagement')}
              </button>
              {showEngagement && <EngagementPanel estimateId={estimateId} />}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
