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
 * it as "stuck". Inside that word there are several genuinely distinct things
 * happening; this module names them so the loader can tell the real story.
 *
 * Honesty contract: a phase is only ever reported when the server has ACTUALLY
 * entered it. The phases come off the journal (`pipeline_events` rows with
 * `metadata.phase`), never off a timer.
 *
 * Pure module: no I/O, no Date.now(). Elapsed values are passed in.
 */

/**
 * Phase vocabulary, in the order the graph REALLY runs them for one pass:
 *
 *   generate node: context → drafting → pricing → saving
 *   assess node:   reviewing   (reads the estimate the generate node saved)
 *   autoRefine:    refining    (only when the first pass came back vague),
 *                  then the generate node and assess run AGAIN.
 *
 * 260927: this used to list `reviewing`/`refining` before `saving`, which is
 * not the order the graph executes (lib/estimate/graph/index.ts: generate →
 * assess → autoRefine → generate). The checklist narrates in execution order,
 * so the declared order now matches it.
 */
export const GENERATE_PHASES = [
  /** Loading project, recordings, photos, company + price book. */
  'context',
  /** The estimator LLM call, the single biggest chunk of the step. */
  'drafting',
  /** Price-book anchoring + regional price research for unmatched items. */
  'pricing',
  /** Totals, dedupe, version bump and the estimate/section/item writes. */
  'saving',
  /** Deterministic vagueness gate (assess node), after the estimate is saved. */
  'reviewing',
  /** Auto-refine round (only when the first pass came back vague). */
  'refining',
] as const

export type GeneratePhase = (typeof GENERATE_PHASES)[number]

/** The phases every generation runs once, in order. `refining` is the optional extra pass. */
export const FIRST_PASS_PHASES = ['context', 'drafting', 'pricing', 'saving', 'reviewing'] as const
export type FirstPassPhase = (typeof FIRST_PASS_PHASES)[number]

export const GENERATE_PHASE_INDEX: Record<GeneratePhase, number> =
  GENERATE_PHASES.reduce(
    (acc, phase, i) => {
      acc[phase] = i
      return acc
    },
    {} as Record<GeneratePhase, number>
  )

/**
 * Typical wall clock per phase. Used as the FALLBACK weight of each checklist
 * row when the live per-phase medians (getStepMedians, keyed
 * `generate_estimate:<phase>`) have not loaded or have too few samples.
 *
 * `refining` is the WHOLE second pass (refine bookkeeping + another generate
 * + another review), since that is what its checklist row stands for.
 *
 * Calibrated against the 2026-08-06 production run (4m40s inside the step,
 * the bulk of it the estimator call) and the price-research batch timings.
 */
export const GENERATE_PHASE_TYPICAL_MS: Record<GeneratePhase, number> = {
  context: 3_000,
  drafting: 75_000,
  pricing: 25_000,
  saving: 4_000,
  reviewing: 3_000,
  refining: 100_000,
}

/** Journal median key for a generate sub-phase (see getStepMedians). */
export function phaseMedianKey(phase: GeneratePhase): string {
  return `generate_estimate:${phase}`
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
  /** pricing/saving: line items in the draft. */
  itemCount?: number
  /** pricing/saving: sections in the draft. */
  sectionCount?: number
  /** context/drafting: transcripts / analyzed photos feeding the estimator. */
  inputCount?: number
  /** refining: which auto-refine round this is (1-based). */
  round?: number
  /**
   * drafting (live): sections the model has written so far, read off the
   * streamed tool-call arguments (lib/ai/providers/openrouter-stream.ts).
   */
  sectionsDrafted?: number
  /** drafting (live): line items written so far. */
  itemsDrafted?: number
  /** drafting (live): titles of the sections written so far, capped + truncated. */
  draftSections?: string[]
}

/**
 * Live phase snapshot, as reconstructed from the journal by
 * `getAttemptOutcome` and threaded to the overlay.
 */
export interface GeneratePhaseProgress {
  /** The phase the server reported most recently. */
  phase: GeneratePhase
  /** Furthest phase reached this attempt, by declared order. */
  furthestPhase: GeneratePhase
  /** ISO `created_at` of the latest phase row. */
  startedAt: string | null
  /** Detail of the latest row for `phase` (counts, round, …). */
  detail?: GeneratePhaseDetail
}

/**
 * One contiguous stretch of a phase, in journal order. Consecutive rows for the
 * same phase (pricing's entry/exit pair, drafting's live section reports)
 * collapse into ONE visit whose detail is the merge of those rows, later rows
 * winning. The auto-refine loop produces a second run of visits after the
 * `refining` visit.
 */
export interface GeneratePhaseVisit {
  phase: GeneratePhase
  /** ISO created_at of the FIRST row of the visit. */
  startedAt: string
  /** Merged detail of every row in the visit. */
  detail: GeneratePhaseDetail
}

/** Minimal journal row shape the phase reconstruction needs. */
export interface PhaseJournalRow {
  step: string
  status: string
  created_at: string
  metadata: Record<string, unknown> | null
}

/**
 * Rebuilds the ordered visit list from the journal rows of ONE attempt. Only
 * `generate_estimate` / `started` rows carrying a valid `metadata.phase` count;
 * anything else (the plain step `started` row, other steps) is ignored.
 */
export function buildPhaseVisits(rows: PhaseJournalRow[]): GeneratePhaseVisit[] {
  const visits: GeneratePhaseVisit[] = []
  for (const r of rows) {
    if (r.step !== 'generate_estimate' || r.status !== 'started') continue
    const { phase, ...detail } = (r.metadata ?? {}) as { phase?: unknown } & GeneratePhaseDetail
    if (!isGeneratePhase(phase)) continue
    const last = visits[visits.length - 1]
    if (last && last.phase === phase) {
      last.detail = { ...last.detail, ...detail }
    } else {
      visits.push({ phase, startedAt: r.created_at, detail: { ...detail } })
    }
  }
  return visits
}

/**
 * "This is taking longer than usual" threshold for the whole
 * `generate_estimate` step. Deliberately generous: a 38-line bathroom remodel
 * legitimately takes minutes, and crying wolf at 60s would be its own lie.
 *
 * The floor keeps a bogus sub-second median from making the overlay declare a
 * healthy 30s run "slow".
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
