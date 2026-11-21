'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Check } from 'lucide-react'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import {
  ClientResponseControl,
  type ClientResponseValue,
} from '@/components/workspace/estimate/client-response-control'
import { InterestBadge } from '@/components/workspace/estimate/analytics/analytics-content'
import { EstimateAnalyticsDrawer } from '@/components/workspace/estimate/analytics/estimate-analytics-drawer'
import { relativeAgo, shortDate } from '@/components/workspace/estimate/analytics/format'
import { deriveInterest, type InterestResult } from '@/lib/estimate/analytics/contracts'
import { createClient } from '@/lib/supabase/client'
import { getEstimateAnalytics } from '@/lib/queries/engagement'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

export interface EstimateStatusSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  estimateId: string
  createdAt: string
  /** Kept for callers; the status no longer depends on it. */
  sentAt: string | null
  viewCount: number
  lastViewedAt: string | null
  clientResponse: string | null
  respondedAt: string | null
  signedOnline: boolean
  /** Unsaved edits or a save in flight: recording an answer would lock content mid-save. */
  recordDisabled: boolean
  onRecord: (response: ClientResponseValue) => Promise<void>
  /**
   * Opens the analytics drawer. The owner (estimate-editor) normally holds that
   * state so `?analytics=1` can open it too. Without it the sheet closes itself
   * and mounts its own drawer (dev fixtures, tests).
   */
  onOpenAnalytics?: () => void
}

type StepTone = 'primary' | 'success' | 'danger'

interface Step {
  key: string
  label: string
  done: boolean
  /** Lines under the label (a date, or a word and a date). */
  lines: string[]
  tone: StepTone
}

const DOT_DONE: Record<StepTone, string> = {
  primary: 'bg-primary text-primary-foreground',
  success: 'bg-[hsl(var(--success))] text-white',
  danger: 'bg-[hsl(var(--destructive-text))] text-white',
}

function ProgressLine({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid grid-cols-3" data-testid="status-progress">
      {steps.map((step, i) => (
        <li key={step.key} data-step={step.key} data-done={step.done ? 'true' : 'false'} className="relative flex min-w-0 flex-col items-center gap-1.5 px-0.5 text-center">
          {i > 0 && (
            <span
              aria-hidden
              className={cn(
                'absolute right-1/2 top-[11px] h-0.5 w-full -translate-y-1/2',
                step.done ? 'bg-primary/60' : 'bg-border',
              )}
            />
          )}
          <span
            aria-hidden
            className={cn(
              'relative z-10 flex size-[22px] items-center justify-center rounded-full ring-4 ring-background',
              step.done ? DOT_DONE[step.tone] : 'border-2 border-border bg-background',
            )}
          >
            {step.done && <Check className="size-3" strokeWidth={3} />}
          </span>
          <span
            className={cn(
              'text-[12.5px] font-semibold leading-tight',
              step.done ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {step.label}
          </span>
          {step.lines.map((line, j) => (
            <span key={j} className="-mt-1 max-w-full truncate text-[11.5px] leading-tight text-muted-foreground">
              {line}
            </span>
          ))}
        </li>
      ))}
    </ol>
  )
}

/**
 * The editor's status sheet: a compact progress line (Created, Opened,
 * Answered), the place to record the client's answer, and a short engagement
 * summary that leads to the full analytics drawer. Bottom sheet on phones,
 * centred card from sm up.
 */
export function EstimateStatusSheet({
  open,
  onOpenChange,
  estimateId,
  createdAt,
  viewCount,
  lastViewedAt,
  clientResponse,
  respondedAt,
  signedOnline,
  recordDisabled,
  onRecord,
  onOpenAnalytics,
}: EstimateStatusSheetProps) {
  const { t } = useTranslation()
  const [ownDrawerOpen, setOwnDrawerOpen] = useState(false)

  const answered = clientResponse === 'accepted' || clientResponse === 'declined'

  const steps: Step[] = [
    { key: 'created', label: t('Created'), done: true, lines: [shortDate(createdAt)], tone: 'primary' },
    {
      key: 'opened',
      label: t('Opened'),
      done: viewCount > 0,
      lines: viewCount > 0 && lastViewedAt ? [shortDate(lastViewedAt)] : [],
      tone: 'primary',
    },
    {
      key: 'answered',
      label: t('Answered'),
      done: answered,
      lines: answered
        ? [clientResponse === 'accepted' ? t('Accepted') : t('Declined'), shortDate(respondedAt ?? '')].filter(Boolean)
        : [],
      tone: clientResponse === 'declined' ? 'danger' : answered ? 'success' : 'primary',
    },
  ]

  // Same Hot / Warm / Cold as the analytics drawer: the full rule needs the
  // visit events (people, return days, reading, signing), so fetch them while
  // the sheet is open; the counters give a first answer until they arrive.
  const [fullInterest, setFullInterest] = useState<InterestResult | null>(null)
  useEffect(() => {
    if (!open || viewCount === 0) return
    let cancelled = false
    getEstimateAnalytics(createClient(), estimateId)
      .then((a) => {
        if (!cancelled) setFullInterest(a.interest)
      })
      .catch(() => {
        /* keep the counter-based answer */
      })
    return () => {
      cancelled = true
    }
  }, [open, estimateId, viewCount, clientResponse])
  const interest = fullInterest ?? deriveInterest({ opens: viewCount, lastViewedAt, clientResponse })

  function openAnalytics() {
    if (onOpenAnalytics) {
      onOpenAnalytics()
      return
    }
    onOpenChange(false)
    setOwnDrawerOpen(true)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <BottomSheetContent desktopClassName="sm:max-w-[440px]">
          {/* Header: drags the sheet (phones) and holds the X, like every sheet. */}
          <DialogHeader
            data-sheet-drag=""
            className="flex shrink-0 touch-none flex-row items-center justify-between gap-3 pl-5 pr-3 pt-1 pb-1 text-left sm:pt-4"
          >
            <DialogTitle className="text-[19px] font-semibold leading-tight tracking-tight">
              {t('Estimate status')}
            </DialogTitle>
            <BottomSheetCloseButton label={t('Close')} />
            <DialogDescription className="sr-only">{t('Estimate status')}</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-3 pb-5">
            <ProgressLine steps={steps} />

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

                <div
                  className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-3.5"
                  data-testid="status-engagement"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('Engagement')}
                    </span>
                    {interest.level !== 'none' && <InterestBadge level={interest.level} />}
                  </div>
                  <dl className="grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">{t('Opens')}</dt>
                      <dd className="text-lg font-semibold tabular-nums">{viewCount}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">{t('Last opened')}</dt>
                      <dd className="truncate text-lg font-semibold">
                        {viewCount > 0 && lastViewedAt ? relativeAgo(lastViewedAt, t) : t('Not opened yet')}
                      </dd>
                    </div>
                  </dl>
                  <Button type="button" className="h-11 w-full gap-2 rounded-full" onClick={openAnalytics}>
                    <BarChart3 className="size-4" aria-hidden />
                    {t('Open analytics')}
                  </Button>
                </div>
            </>
          </div>
        </BottomSheetContent>
      </Dialog>
      {!onOpenAnalytics && (
        <EstimateAnalyticsDrawer open={ownDrawerOpen} onOpenChange={setOwnDrawerOpen} estimateId={estimateId} />
      )}
    </>
  )
}
