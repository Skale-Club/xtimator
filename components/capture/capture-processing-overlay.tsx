'use client'

import { useEffect, useState } from 'react'
import { useAppTranslation } from '@/lib/i18n/use-translation'
import { TowerLoader } from '@/components/ui/tower-loader'
import {
  computeProgress,
  STEP_SEQUENCES,
  type CaptureProgressMode,
} from '@/lib/estimate/progress-model'
import {
  isGenerateOverdue,
  type GeneratePhaseProgress,
} from '@/lib/estimate/generation-phases'
import {
  GENERATE_PHASE_LABELS,
  GENERATE_PHASE_QUIPS,
  STEP_QUIPS,
  phaseDetailLine,
  pickQuip,
} from './processing-narration'

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
  /**
   * Phase 168 (PHOTO-02 UI half): analyze-step coverage counts from the
   * journal (168-01's analyze-photos.ts metadata, threaded through
   * poll-outcome's StageProgress). When coverage is partial (analyzedCount <
   * totalCount, or any failure), a "N of M photos analyzed" subtitle renders
   * below the main label instead of silently hiding the shortfall.
   */
  analyzedCount?: number
  totalCount?: number
  failedCount?: number
  /**
   * 260806: journal-reported sub-phase of the `generate_estimate` step. That
   * step is ~90% of a capture's wall clock (4m40s of a 5m03s production run on
   * 2026-08-06) and used to render as ONE static label, which reads as a hung
   * screen. With this present the overlay names the real phase, prints the
   * counts the server reported, and fills the segment by phase boundaries.
   */
  generatePhase?: GeneratePhaseProgress
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
  generatePhase,
}: CaptureProcessingOverlayProps) {
  // useAppTranslation, not useTranslation: in the New Xtimate popup this
  // component renders inside a ScopedLanguageProvider set to the ESTIMATE's
  // language, so a Portuguese operator writing an English estimate was getting
  // an English processing screen. The client never sees this surface, so it
  // follows the app language.
  const { t } = useAppTranslation()

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
  /** Rotating ambient line: flavour only, never carries information. */
  let quip: string | null = null
  /** Factual sub-line built from server-reported counts. */
  let phaseDetail: string | null = null
  /** True once the step has run well past what is normal, and says so. */
  let overdue = false
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

    // 260806: the generate step's sub-phase, when the journal has reported one.
    // Guarded on the active step so a stale phase payload can never narrate a
    // step the pipeline has already moved past.
    const livePhase =
      effectiveActive === 'generate_estimate' && generatePhase ? generatePhase : null
    const phaseElapsedMs =
      livePhase?.startedAt != null
        ? Math.max(0, nowMs - Date.parse(livePhase.startedAt))
        : elapsedMs

    const { segments } = computeProgress({
      mode,
      completedSteps: effectiveCompleted,
      activeStep: effectiveActive,
      activeStepElapsedMs: elapsedMs,
      medians,
      generatePhase: livePhase
        ? {
            phase: livePhase.phase,
            furthestPhase: livePhase.furthestPhase,
            phaseElapsedMs,
          }
        : undefined,
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
      // A reported phase is MORE specific than the step label, so it wins:
      // "Pricing the line items" instead of a fourth minute of "Generating
      // estimate". Without one, nothing changes from the previous behavior.
      label = livePhase ? t(GENERATE_PHASE_LABELS[livePhase.phase]) : activeStepLabel
      elapsedSuffix = `${Math.floor(elapsedMs / 1000)}s`
    }

    if (!isDone && effectiveActive) {
      // Ambient line. Scoped to the live phase when there is one, otherwise to
      // the step; rotates off the same elapsed clock the bar already tracks.
      const pool = livePhase
        ? GENERATE_PHASE_QUIPS[livePhase.phase]
        : STEP_QUIPS[effectiveActive]
      const raw = pickQuip(pool, phaseElapsedMs)
      quip = raw ? `${t(raw)}…` : null
    }

    if (livePhase) {
      // Factual sub-line: server-reported counts only.
      const detail = phaseDetailLine(livePhase.phase, livePhase.detail)
      if (detail?.kind === 'priced') {
        phaseDetail = `${detail.researched} ${t('of')} ${detail.candidates} ${t('items priced')}`
      } else if (detail?.kind === 'to_price') {
        phaseDetail = `${detail.candidates} ${t('items to price')}`
      } else if (detail?.kind === 'items') {
        phaseDetail = `${detail.itemCount} ${t('items in')} ${detail.sectionCount} ${t('sections')}`
      } else if (detail?.kind === 'round') {
        phaseDetail = `${t('Pass')} ${detail.round + 1}`
      }

      // Say it plainly instead of freezing at 95% and pretending nothing is
      // wrong. The estimate is still coming: this is a long job, not a dead one.
      overdue = isGenerateOverdue({
        elapsedMs,
        medianMs: medians?.['generate_estimate'],
      })
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

  // Phase 168 (PHOTO-02 UI half): surface the journal's real analyze coverage
  // ("N of M photos analyzed") whenever it's partial — some photos still
  // pending analysis (analyzedCount < totalCount) or at least one hard
  // failure (failedCount > 0) — rather than silently hiding the shortfall
  // behind the generic "Analyzing photos" label.
  const hasPartialCoverage =
    typeof analyzedCount === 'number' &&
    typeof totalCount === 'number' &&
    (analyzedCount < totalCount || (failedCount ?? 0) > 0)
  const coverageSubtitle = hasPartialCoverage
    ? `${analyzedCount} ${t('of')} ${totalCount} ${t('photos analyzed')}`
    : null

  // One factual sub-line at a time: photo coverage belongs to the analyze step,
  // the phase detail to generate. They can never both be live, but pick
  // explicitly rather than relying on that.
  const subtitle = coverageSubtitle ?? phaseDetail

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
      {subtitle && (
        <p
          className="text-xs text-muted-foreground/70"
          data-testid="capture-processing-coverage"
        >
          {subtitle}
        </p>
      )}
      {quip && (
        <p
          className="max-w-[260px] text-center text-xs italic text-muted-foreground/60"
          data-testid="capture-processing-quip"
        >
          {quip}
        </p>
      )}
      {overdue && (
        <p
          className="max-w-[260px] text-center text-xs text-muted-foreground/70"
          data-testid="capture-processing-overdue"
        >
          {t('Bigger job than usual, still working on it')}
        </p>
      )}
    </div>
  )
}
