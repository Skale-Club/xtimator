/**
 * 260707-o7a — pure progress computation for the capture processing overlay.
 *
 * "precisa ter um progress bar real do processo, sem ser fake" — the P4
 * journal-first architecture (pipeline_events) makes an HONEST progress bar
 * possible: segments are the REAL pipeline steps of the active capture mode,
 * a segment only completes when the step's `succeeded` event exists in the
 * journal, and the in-segment fill is elapsed time measured against the
 * step's historical median duration — hard-capped below 100% until the
 * journal confirms. Estimation-from-real-data, never fake completion.
 *
 * Pure module: no Date.now(), no I/O — elapsed time is passed in by the
 * caller (the overlay's local 250ms re-render timer). Fully unit-tested in
 * tests/unit/estimate/progress-model.test.ts.
 */

import { generatePhaseFill, type GeneratePhase } from './generation-phases'

export type CaptureProgressMode = 'audio' | 'photos' | 'text'

/**
 * Journal step sequence per capture mode — ONLY steps that emit
 * pipeline_events rows (lib/observability/pipeline-events.ts). Order matches
 * the server-side chain each mode dispatches.
 */
export const STEP_SEQUENCES: Record<CaptureProgressMode, string[]> = {
  audio: ['save_recording', 'transcribe', 'generate_estimate'],
  photos: ['save_recording', 'analyze', 'generate_estimate'],
  text: ['save_recording', 'generate_estimate'],
}

/**
 * Static fallback medians, measured from production pipeline_events
 * (2026-07-07). Used when the live medians fetch (getStepMedians in
 * lib/actions/attempt-outcome.ts) hasn't resolved yet or failed — still real
 * measurements, just not live ones.
 */
export const FALLBACK_MEDIANS_MS: Record<string, number> = {
  save_recording: 2_000,
  transcribe: 8_000,
  analyze: 12_000,
  generate_estimate: 35_000,
}

/**
 * An active segment's fill is hard-capped here until the journal confirms the
 * step succeeded — the bar visibly WAITS at 95% of the segment rather than
 * ever pretending a step finished.
 */
export const ACTIVE_FILL_CAP = 0.95

/** Defensive median for a step with no fallback entry (should not happen for
 * journaled steps — every STEP_SEQUENCES member has a FALLBACK_MEDIANS_MS row). */
const DEFAULT_MEDIAN_MS = 10_000

export type ProgressSegmentState = 'done' | 'active' | 'pending'

export interface ProgressSegment {
  step: string
  state: ProgressSegmentState
  /** 0..1 within this segment. done → 1; active → capped at ACTIVE_FILL_CAP; pending → 0. */
  fill: number
}

export interface ProgressSnapshot {
  /** 0..1 across the whole bar (equal-share weighted sum of segment fills). */
  fraction: number
  segments: ProgressSegment[]
}

function medianFor(step: string, medians?: Record<string, number>): number {
  const candidate = medians?.[step] ?? FALLBACK_MEDIANS_MS[step] ?? DEFAULT_MEDIAN_MS
  return Number.isFinite(candidate) && candidate > 0 ? candidate : DEFAULT_MEDIAN_MS
}

/**
 * Computes the segmented progress snapshot.
 *
 * Weighting: each step owns an EQUAL share of the bar (1/n), deliberately NOT
 * weighted by median duration — median-weighting would shrink fast steps
 * (save_recording ~2s vs generate_estimate ~35s) into invisible slivers,
 * defeating the segmented bar's legibility (the user should SEE each pipeline
 * step exist and complete). The in-segment fill is where the real timing
 * lives: elapsed / median, capped at ACTIVE_FILL_CAP until the journal
 * confirms the step's `succeeded` event.
 *
 * Honesty invariants (enforced here, asserted in tests):
 *  - a segment is `done` (fill 1) ONLY when its step is in `completedSteps`
 *    (i.e. has a journal `succeeded` event) — never by elapsed time alone;
 *  - an `active` segment's fill never reaches 1, no matter how much time has
 *    elapsed (min(elapsed/median, ACTIVE_FILL_CAP));
 *  - steps outside the mode's sequence (e.g. 'preview_redirect') are ignored.
 */
export function computeProgress(input: {
  mode: CaptureProgressMode
  /** Steps with a journal `succeeded` event, in journal order. */
  completedSteps: string[]
  /** The step currently running (latest `started` without a `succeeded`), if any. */
  activeStep: string | null
  /** Wall-clock ms since the active step's `started` event (caller-computed). */
  activeStepElapsedMs: number
  /** Live medians (getStepMedians) — merged over FALLBACK_MEDIANS_MS by the caller;
   * any missing step falls back to FALLBACK_MEDIANS_MS here regardless. */
  medians?: Record<string, number>
  /**
   * 260806: journal-reported sub-phase of the ACTIVE `generate_estimate` step
   * (lib/estimate/generation-phases.ts). When present, this step's segment is
   * filled by REAL phase boundaries instead of elapsed-vs-median. That is the
   * honest upgrade, since the phases come off the journal exactly like the
   * segment completions do. Absent (older attempt, or a phase row not yet
   * written) leaves the elapsed/median behavior below unchanged.
   */
  generatePhase?: {
    phase: GeneratePhase
    furthestPhase: GeneratePhase
    /** ms since the latest phase row (caller-computed, like activeStepElapsedMs). */
    phaseElapsedMs: number
  }
}): ProgressSnapshot {
  const steps = STEP_SEQUENCES[input.mode]
  const completed = new Set(input.completedSteps)

  const segments: ProgressSegment[] = steps.map((step) => {
    if (completed.has(step)) {
      return { step, state: 'done', fill: 1 }
    }
    if (step === input.activeStep) {
      if (step === 'generate_estimate' && input.generatePhase) {
        const raw = generatePhaseFill({
          phase: input.generatePhase.phase,
          furthestPhase: input.generatePhase.furthestPhase,
          phaseElapsedMs: input.generatePhase.phaseElapsedMs,
        })
        return { step, state: 'active', fill: Math.min(raw, ACTIVE_FILL_CAP) }
      }
      const median = medianFor(step, input.medians)
      const raw = Math.max(0, input.activeStepElapsedMs) / median
      return { step, state: 'active', fill: Math.min(raw, ACTIVE_FILL_CAP) }
    }
    return { step, state: 'pending', fill: 0 }
  })

  const fraction = segments.reduce((sum, s) => sum + s.fill, 0) / segments.length
  return { fraction, segments }
}
