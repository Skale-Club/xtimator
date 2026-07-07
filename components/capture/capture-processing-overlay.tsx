'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { TowerLoader } from '@/components/ui/tower-loader'
import {
  computeProgress,
  STEP_SEQUENCES,
  type CaptureProgressMode,
} from '@/lib/estimate/progress-model'

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
   * 260707-o7a: when provided, the overlay renders the REAL journal-driven
   * segmented progress bar for this capture mode. All progress props are
   * additive — existing callers passing only `stage` (e.g.
   * inline-audio-recorder) keep the original loader + label rendering.
   */
  mode?: CaptureProgressMode
  /** Steps with a journal `succeeded` event, in journal order. */
  completedSteps?: string[]
  /** The step currently running (latest `started` without a `succeeded`). */
  activeStep?: string | null
  /** ISO created_at of the active step's `started` journal event. */
  activeStepStartedAt?: string | null
  /** Live per-step median durations (getStepMedians); fallbacks apply when absent. */
  medians?: Record<string, number>
}

export function CaptureProcessingOverlay({
  stage,
  mode,
  completedSteps,
  activeStep,
  activeStepStartedAt,
  medians,
}: CaptureProcessingOverlayProps) {
  const { t } = useTranslation()

  // Local 250ms re-render timer: the TIMER is local but the STATE it fills
  // toward is real — elapsed is measured against the journal's started
  // timestamp and the fill is capped below 100% until the journal confirms
  // the step succeeded (progress-model ACTIVE_FILL_CAP).
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!mode) return
    const id = setInterval(() => setNowMs(Date.now()), 250)
    return () => clearInterval(id)
  }, [mode])

  // Resolve the fallback status label per stage. Keep raw string literals so
  // the i18n extractor picks them up — do NOT build labels via a Record at
  // render time.
  const stageLabel =
    stage === 'saving'       ? t('Saving') :
    stage === 'transcribing' ? t('Transcribing') :
    stage === 'analyzing'    ? t('Analyzing') :
    stage === 'generating'   ? t('Generating estimate') :
    stage === 'done'         ? t('Almost ready') :
                               t('Working...')

  // Journal-driven segmented bar (only when a mode is supplied).
  let progressBar: React.ReactNode = null
  let label = stageLabel
  let elapsedSuffix: string | null = null
  if (mode) {
    // stage === 'done' ONLY happens after a journal-confirmed `completed`
    // outcome (pollEstimateOutcome is journal-authoritative), so rendering the
    // bar full here is still real — the confirmation just arrived as the
    // terminal outcome instead of a pending-tick payload.
    const isDone = stage === 'done'
    const effectiveCompleted = isDone ? STEP_SEQUENCES[mode] : completedSteps ?? []
    const effectiveActive = isDone ? null : activeStep ?? null
    const elapsedMs =
      effectiveActive && activeStepStartedAt
        ? Math.max(0, nowMs - Date.parse(activeStepStartedAt))
        : 0

    const { segments } = computeProgress({
      mode,
      completedSteps: effectiveCompleted,
      activeStep: effectiveActive,
      activeStepElapsedMs: elapsedMs,
      medians,
    })

    // Current step label — inline t() literals (extractor requirement). Falls
    // back to the stage label before the first journal row arrives (or for a
    // step outside the known four).
    const activeStepLabel =
      effectiveActive === 'save_recording'    ? t('Saving') :
      effectiveActive === 'transcribe'        ? t('Transcribing') :
      effectiveActive === 'analyze'           ? t('Analyzing photos') :
      effectiveActive === 'generate_estimate' ? t('Generating estimate') :
                                                null
    if (activeStepLabel) {
      label = activeStepLabel
      elapsedSuffix = `${Math.floor(elapsedMs / 1000)}s`
    }

    progressBar = (
      <div
        className="flex w-full max-w-[240px] gap-1.5"
        data-testid="capture-progress-bar"
      >
        {segments.map((seg) => (
          <div
            key={seg.step}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-linear"
              style={{ width: `${Math.round(seg.fill * 1000) / 10}%` }}
              data-testid={`capture-progress-segment-${seg.step}`}
              data-state={seg.state}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/60 backdrop-blur-sm"
      data-testid="capture-processing-overlay"
    >
      <div
        className="flex items-center justify-center"
        data-testid="capture-processing-loader"
      >
        <TowerLoader size={1.8} label={t('Loading')} />
      </div>
      {progressBar}
      <p
        className="text-sm text-muted-foreground"
        data-testid="capture-processing-label"
      >
        {label}
        {elapsedSuffix && (
          <span className="tabular-nums text-muted-foreground/70"> · {elapsedSuffix}</span>
        )}
      </p>
    </div>
  )
}
