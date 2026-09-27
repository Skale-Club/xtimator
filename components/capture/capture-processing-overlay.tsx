'use client'

import { useEffect, useState } from 'react'
import { useAppTranslation } from '@/lib/i18n/use-translation'
import { TowerLoader } from '@/components/ui/tower-loader'
import {
  buildChecklist,
  type CaptureProgressMode,
  type StepTiming,
} from '@/lib/estimate/progress-model'
import type { GeneratePhaseVisit } from '@/lib/estimate/generation-phases'
import { formatElapsed, remainingLine } from './processing-narration'
import { CaptureProgressChecklist } from './capture-progress-checklist'

export type CaptureProcessingStage =
  | 'idle'
  | 'saving'
  | 'transcribing'
  | 'analyzing'
  | 'generating'
  | 'done'

export interface CaptureProcessingOverlayProps {
  stage: CaptureProcessingStage
  /**
   * When provided, the overlay renders the journal-driven CHECKLIST for this
   * capture mode. All progress props are additive: callers passing only
   * `stage` (e.g. inline-audio-recorder) keep the plain loader + label.
   */
  mode?: CaptureProgressMode
  /** Steps with a journal `succeeded` event, in journal order. */
  completedSteps?: string[]
  /** The step currently running (latest `started` without a `succeeded`). */
  activeStep?: string | null
  /** ISO created_at of the active step's first `started` journal event. */
  activeStepStartedAt?: string | null
  /** Live typical durations (getStepMedians); fallbacks apply when absent. */
  medians?: Record<string, number>
  /** Photo-analysis coverage from the analyze step's journal row. */
  analyzedCount?: number
  totalCount?: number
  failedCount?: number
  /** 260927: per-step first-started / first-succeeded timestamps. */
  stepTimings?: StepTiming[]
  /** 260927: every generate sub-phase visit so far (checklist rows + facts). */
  phaseVisits?: GeneratePhaseVisit[]
  /**
   * 260927: when set, the overlay offers to keep going without the operator
   * watching. The server owns the pipeline end to end once it is dispatched,
   * so leaving is always safe; this callback is how the parent lets them.
   */
  onContinueInBackground?: () => void
  /**
   * Positioning. `overlay` (default) covers its positioned parent, as in the
   * New Xtimate popup. `inline` flows in the page, for surfaces that render it
   * as the page's main content (the fullscreen /capture route, the project
   * estimate tab).
   */
  layout?: 'overlay' | 'inline'
}

export function CaptureProcessingOverlay({
  stage,
  mode,
  completedSteps,
  activeStep,
  activeStepStartedAt,
  medians,
  analyzedCount,
  totalCount,
  failedCount,
  stepTimings,
  phaseVisits,
  onContinueInBackground,
  layout = 'overlay',
}: CaptureProcessingOverlayProps) {
  // useAppTranslation, not useTranslation: in the New Xtimate popup this
  // component renders inside a ScopedLanguageProvider set to the ESTIMATE's
  // language. The client never sees this surface, so it follows the app
  // language.
  const { t } = useAppTranslation()

  // Local 250ms re-render timer: the TIMER is local but the STATE it shows is
  // real. Every elapsed value is measured against journal timestamps, and a row
  // only turns done when the journal says so.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!mode) return
    const id = setInterval(() => setNowMs(Date.now()), 250)
    return () => clearInterval(id)
  }, [mode])

  const containerClass =
    layout === 'overlay'
      ? 'absolute inset-0 z-10 overflow-y-auto bg-background/95 backdrop-blur-sm'
      : 'w-full'

  if (!mode) {
    const stageLabel =
      stage === 'saving'       ? t('Saving') :
      stage === 'transcribing' ? t('Transcribing') :
      stage === 'analyzing'    ? t('Analyzing') :
      stage === 'generating'   ? t('Generating estimate') :
      stage === 'done'         ? t('Almost ready') :
                                 t('Working...')
    return (
      <div
        className={`${containerClass} flex flex-col items-center justify-center gap-4`}
        data-testid="capture-processing-overlay"
      >
        <div className="flex items-center justify-center" data-testid="capture-processing-loader">
          <TowerLoader size={1.8} label={t('Loading')} />
        </div>
        <p className="text-sm text-muted-foreground" data-testid="capture-processing-label">
          {stageLabel}
        </p>
      </div>
    )
  }

  const isDone = stage === 'done'
  const snapshot = buildChecklist({
    mode,
    done: isDone,
    completedSteps: completedSteps ?? [],
    activeStep: isDone ? null : activeStep ?? null,
    activeStepStartedAt: activeStepStartedAt ?? null,
    stepTimings,
    phaseVisits,
    analyzedCount,
    totalCount,
    failedCount,
    medians,
    nowMs,
  })
  const fraction = snapshot.fraction

  const remaining = remainingLine(snapshot.remainingMs, snapshot.overdue)
  const remainingText = isDone
    ? t('Estimate ready')
    : remaining.kind === 'overdue'
      ? t('Bigger job than usual, still working on it')
      : remaining.kind === 'under_a_minute'
        ? t('Less than a minute left')
        : `${t('About')} ${remaining.minutes} ${t('min left')}`

  return (
    <div className={containerClass} data-testid="capture-processing-overlay">
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-5 px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="shrink-0" data-testid="capture-processing-loader">
            <TowerLoader size={0.9} label={t('Loading')} />
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold" data-testid="capture-processing-label">
              {isDone ? t('Your estimate is ready') : t('Generating your estimate')}
            </p>
            <p
              className={`text-xs ${snapshot.overdue ? 'text-foreground/75' : 'text-muted-foreground'}`}
              data-testid="capture-processing-remaining"
            >
              {remainingText}
            </p>
          </div>
          {snapshot.elapsedMs > 0 && !isDone && (
            <span
              className="ml-auto shrink-0 rounded-full bg-muted/60 px-2 py-0.5 text-xs leading-none tabular-nums text-muted-foreground/80"
              data-testid="capture-processing-elapsed"
              aria-label={t('Elapsed time')}
            >
              {formatElapsed(snapshot.elapsedMs)}
            </span>
          )}
        </div>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          aria-label={t('Estimate progress')}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${Math.round(fraction * 1000) / 10}%` }}
            data-testid="capture-progress-fill"
          />
        </div>

        <CaptureProgressChecklist rows={snapshot.rows} mode={mode} t={t} />

        {!isDone && (
          <div className="space-y-2 border-t pt-4 text-center">
            <p className="text-xs text-muted-foreground" data-testid="capture-processing-leave-hint">
              {t('You can leave this screen. The estimate keeps generating and we will let you know when it is ready.')}
            </p>
            {onContinueInBackground && (
              <button
                type="button"
                onClick={onContinueInBackground}
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                data-testid="capture-continue-in-background"
              >
                {t('Continue in the background')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
