/**
 * lib/estimate/generation-phases.ts
 *
 * The SUB-PHASES of the `generate_estimate` journal step: the pure, shared
 * vocabulary between the server (which reports them) and the capture overlay
 * (which narrates them).
 *
 * Why this exists: `generate_estimate` is ~90% of a capture's wall clock (a
 * production audio attempt on 2026-08-06 spent 4m40s of its 5m03s inside that
 * one step) and it was a SINGLE segment with a SINGLE static label. The user
 * saw one word, "Generating estimate", for four and a half minutes and read
 * it as "stuck". Inside that word there are six genuinely distinct things
 * happening; this module names them so the loader can tell the real story.
 *
 * Honesty contract (inherited from progress-model.ts): a phase is only ever
 * reported when the server has ACTUALLY entered it. The phases come off the
 * journal (`pipeline_events` rows with `metadata.phase`), never off a timer.
 * The elapsed-based creep WITHIN a phase is bounded by that phase's ceiling, so
 * time alone can never carry the bar into a phase the server hasn't reached.
 *
 * Pure module: no I/O, no Date.now(). Elapsed values are passed in.
 */

/**
 * Ordered phase vocabulary. The order is the monotonic progress order. See
 * `furthestPhase` in the journal reader (lib/actions/attempt-outcome.ts): the
 * auto-refine loop re-enters `drafting`/`pricing` for a second round, and the
 * bar must NOT walk backwards when it does. The label follows the live phase;
 * the fill follows the furthest phase reached.
 */
export const GENERATE_PHASES = [
  /** Loading project, recordings, photos, company + price book. */
  'context',
  /** The estimator LLM call, the single biggest chunk of the step. */
  'drafting',
  /** Price-book anchoring + regional price research for unmatched items. */
  'pricing',
  /** Deterministic vagueness gate (assess node). */
  'reviewing',
  /** Auto-refine round (only when the first pass came back vague). */
  'refining',
  /** Totals, dedupe, version bump and the estimate/section/item writes. */
  'saving',
] as const

export type GeneratePhase = (typeof GENERATE_PHASES)[number]

export const GENERATE_PHASE_INDEX: Record<GeneratePhase, number> =
  GENERATE_PHASES.reduce(
    (acc, phase, i) => {
      acc[phase] = i
      return acc
    },
    {} as Record<GeneratePhase, number>
  )

/**
 * Each phase's [start, end] share of the `generate_estimate` SEGMENT (not of
 * the whole bar). Widths are proportional to the measured wall-clock split of a
 * real production run, so the bar moves at roughly the rate the work actually
 * progresses instead of at a rate the code made up.
 *
 * The last phase ends at ACTIVE_FILL_CAP (progress-model.ts) deliberately: the
 * segment still visibly WAITS for the journal's `succeeded` event rather than
 * ever reaching 100% on its own.
 */
export const GENERATE_PHASE_BOUNDS: Record<GeneratePhase, [number, number]> = {
  context: [0.0, 0.1],
  drafting: [0.1, 0.55],
  pricing: [0.55, 0.78],
  reviewing: [0.78, 0.86],
  refining: [0.86, 0.92],
  saving: [0.92, 0.95],
}

/**
 * Typical wall clock per phase, used ONLY for the bounded creep inside the
 * phase the server is currently in. Measured from the 2026-08-06 production
 * run + the price-research batch timings.
 *
 * These are deliberately NOT read from `getStepMedians()`: that aggregate is
 * per-STEP, and no per-phase durations exist in the journal yet (the phase rows
 * this file describes are what will start producing them).
 */
export const GENERATE_PHASE_TYPICAL_MS: Record<GeneratePhase, number> = {
  context: 2_000,
  drafting: 30_000,
  pricing: 15_000,
  reviewing: 3_000,
  refining: 25_000,
  saving: 3_000,
}

export function isGeneratePhase(value: unknown): value is GeneratePhase {
  return (
    typeof value === 'string' &&
    (GENERATE_PHASES as readonly string[]).includes(value)
  )
}

/**
 * Structured detail a phase row may carry in its journal metadata. Every field
 * is optional: a phase reports whatever it genuinely knows at that moment and
 * nothing more (the pricing phase, for instance, knows the candidate count on
 * entry and the resolved count on exit).
 */
export interface GeneratePhaseDetail {
  /** pricing: unmatched items handed to the research orchestrator. */
  candidates?: number
  /** pricing (exit): items that came back with a real regional price. */
  researched?: number
  /** drafting/saving: line items in the draft. */
  itemCount?: number
  /** drafting/saving: sections in the draft. */
  sectionCount?: number
  /** context: transcripts / analyzed photos feeding the estimator. */
  inputCount?: number
  /** refining: which auto-refine round this is (1-based). */
  round?: number
}

/**
 * Live phase snapshot, as reconstructed from the journal by
 * `getAttemptOutcome` and threaded to the overlay.
 */
export interface GeneratePhaseProgress {
  /** The phase the server reported most recently. Drives the LABEL. */
  phase: GeneratePhase
  /** Furthest phase reached this attempt. Drives the FILL (monotonic). */
  furthestPhase: GeneratePhase
  /** ISO `created_at` of the latest phase row. The creep measures from it. */
  startedAt: string | null
  /** Detail of the latest row for `phase` (counts, round, …). */
  detail?: GeneratePhaseDetail
}

/**
 * In-segment fill for `generate_estimate` when phase telemetry is available.
 *
 * floor/ceiling come from the FURTHEST phase reached (journal-confirmed, so the
 * refine loop can never rewind the bar); the creep inside that band is elapsed
 * time against the CURRENT phase's typical duration, asymptotically capped at
 * the band ceiling. Returns a value in [0, GENERATE_PHASE_BOUNDS.saving[1]].
 */
export function generatePhaseFill(input: {
  phase: GeneratePhase
  furthestPhase: GeneratePhase
  /** ms since the latest phase row was written. */
  phaseElapsedMs: number
}): number {
  const [floor, ceiling] = GENERATE_PHASE_BOUNDS[input.furthestPhase]
  const typical = GENERATE_PHASE_TYPICAL_MS[input.phase] || 10_000
  const ratio = Math.min(Math.max(0, input.phaseElapsedMs) / typical, 1)
  // 0.92 of the band, never the band's full width: the next phase's journal
  // row is what completes it, not the clock.
  return floor + ratio * (ceiling - floor) * 0.92
}

/**
 * "This is taking longer than usual" threshold for the whole
 * `generate_estimate` step. Deliberately generous: a 38-line bathroom remodel
 * legitimately takes minutes, and crying wolf at 60s would be its own lie.
 *
 * The floor exists because the live median is currently unreliable for this
 * step (the Inngest handler re-stamps its start timestamp on every replay, so
 * recorded `duration_ms` measures only the last replay leg). Never let a bogus
 * sub-second median make the overlay declare a healthy 30s run "slow".
 */
export const GENERATE_OVERDUE_FLOOR_MS = 120_000

export function isGenerateOverdue(input: {
  elapsedMs: number
  medianMs?: number
}): boolean {
  const threshold = Math.max(
    GENERATE_OVERDUE_FLOOR_MS,
    (input.medianMs ?? 0) * 2.5
  )
  return input.elapsedMs > threshold
}
