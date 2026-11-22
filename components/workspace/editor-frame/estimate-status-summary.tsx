'use client'

import { Check } from 'lucide-react'
import {
  ClientResponseControl,
  type ClientResponseValue,
} from '@/components/workspace/estimate/client-response-control'
import { shortDate } from '@/components/workspace/estimate/analytics/format'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

export interface EstimateStatusSummaryProps {
  estimateId: string
  createdAt: string
  viewCount: number
  lastViewedAt: string | null
  clientResponse: string | null
  respondedAt: string | null
  signedOnline: boolean
  /** Unsaved edits or a save in flight: recording an answer would lock content mid-save. */
  recordDisabled: boolean
  onRecord: (response: ClientResponseValue) => Promise<void>
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
              'relative z-10 flex size-[22px] items-center justify-center rounded-full ring-4 ring-card',
              step.done ? DOT_DONE[step.tone] : 'border-2 border-border bg-card',
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
 * Where the estimate stands, at the top of the estimate's analytics panel:
 * a compact progress line (Created, Opened, Answered) and the place to record
 * the client's answer when it came by phone or in person. It renders before
 * the analytics load, so recording never waits on the visit data.
 */
export function EstimateStatusSummary({
  estimateId,
  createdAt,
  viewCount,
  lastViewedAt,
  clientResponse,
  respondedAt,
  signedOnline,
  recordDisabled,
  onRecord,
}: EstimateStatusSummaryProps) {
  const { t } = useTranslation()
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

  return (
    <section
      aria-label={t('Estimate status')}
      data-testid="estimate-status-summary"
      className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:flex-row sm:items-center sm:gap-6"
    >
      <div className="min-w-0 sm:flex-1">
        <ProgressLine steps={steps} />
      </div>
      <div className="flex flex-col gap-2 sm:w-[260px] sm:shrink-0">
        {!signedOnline && (
          <p className="text-[13px] leading-snug text-muted-foreground">
            {t('Got the answer by phone or in person? Record it here.')}
          </p>
        )}
        <div className="flex">
          <ClientResponseControl
            alwaysShowLabel
            clientResponse={clientResponse}
            respondedAt={respondedAt}
            signedOnline={signedOnline}
            estimateId={estimateId}
            disabled={recordDisabled}
            onRecord={onRecord}
          />
        </div>
      </div>
    </section>
  )
}
