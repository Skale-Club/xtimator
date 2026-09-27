/**
 * Pure progress model for the capture processing overlay.
 *
 * 260707-o7a: "precisa ter um progress bar real do processo, sem ser fake".
 * The journal (pipeline_events) makes an HONEST progress display possible.
 *
 * 260927: the display is now a CHECKLIST, not three equal bar segments. The
 * old bar gave each pipeline step a third of the width, but generation is ~90%
 * of the wall clock, so the bar raced to two thirds in ten seconds and then sat
 * still for minutes. And nothing stayed "done" on screen: each step's label
 * vanished the moment the next began, so the operator had no sense of how much
 * was already behind them. The checklist fixes both:
 *
 *  - every step AND every generate sub-phase is its own row, and a finished
 *    row keeps its check mark, its duration and the fact the server reported
 *    for it ("38 items in 5 sections");
 *  - the overall bar weights each row by how long it REALLY takes (live
 *    journal medians, with measured fallbacks), so it moves at the rate the
 *    work moves;
 *  - the remaining-time estimate comes from those same medians.
 *
 * Honesty invariants (asserted in tests/unit/estimate/progress-model.test.ts):
 *  - a row is `done` only when the journal proves it: its step succeeded, or a
 *    LATER phase/step has started (the pipeline is strictly ordered);
 *  - the active row's share of the bar creeps asymptotically and never reaches
 *    its end, however long it runs; only the journal completes a row;
 *  - the bar never walks backwards, even when the auto-refine pass appears;
 *  - nothing is invented: details are the server's own reported counts.
 *
 * Pure module: no Date.now(), no I/O. The caller passes `nowMs`.
 */

import {
  FIRST_PASS_PHASES,
  GENERATE_PHASE_TYPICAL_MS,
  isGenerateOverdue,
  phaseMedianKey,
  type FirstPassPhase,
  type GeneratePhase,
  type GeneratePhaseDetail,
  type GeneratePhaseVisit,
} from './generation-phases'

export type CaptureProgressMode = 'audio' | 'photos' | 'text'

/**
 * Journal step sequence per capture mode: ONLY steps that emit pipeline_events
 * rows (lib/observability/pipeline-events.ts). Order matches the server-side
 * chain each mode dispatches.
 */
export const STEP_SEQUENCES: Record<CaptureProgressMode, string[]> = {
  audio: ['save_recording', 'transcribe', 'generate_estimate'],
  photos: ['save_recording', 'analyze', 'generate_estimate'],
  text: ['save_recording', 'generate_estimate'],
}

/**
 * Static fallback medians per step, measured from production pipeline_events.
 * Used when the live medians fetch (getStepMedians) hasn't resolved or failed.
 */
export const FALLBACK_MEDIANS_MS: Record<string, number> = {
  save_recording: 2_000,
  transcribe: 8_000,
  analyze: 12_000,
  generate_estimate: 110_000,
}

/**
 * The active row's share of the bar is capped here: the bar visibly WAITS
 * rather than ever pretending a row finished before the journal says so.
 */
export const ACTIVE_FILL_CAP = 0.95

/**
 * Ceiling for the bar during the auto-refine second pass. The first pass alone
 * can already sit at ACTIVE_FILL_CAP by the time refining begins, so the second
 * pass creeps the last sliver above it. It still never reaches 100%: only the
 * journal's terminal outcome does that.
 */
const REFINE_FILL_CAP = 0.99

/** Shortest "time left" the model will claim for a row that is still running. */
const MIN_ACTIVE_REMAINING_SHARE = 0.15

export type ChecklistRowId =
  | 'save_recording'
  | 'transcribe'
  | 'analyze'
  | `generate:${FirstPassPhase}`
  | 'generate:refining'

export type ChecklistRowState = 'done' | 'active' | 'pending'

/** The fact a row shows under its label. Only ever server-reported numbers. */
export type ChecklistDetail =
  | { kind: 'photos'; analyzed: number; total: number; failed: number }
  | { kind: 'drafting_live'; sections: number; items: number; titles: string[] }
  | { kind: 'drafted'; items: number; sections: number }
  | { kind: 'to_price'; candidates: number }
  | { kind: 'priced'; researched: number; candidates: number }
  | { kind: 'price_book'; items: number }
  | { kind: 'second_pass'; round: number; phase: GeneratePhase }

export interface ChecklistRow {
  id: ChecklistRowId
  state: ChecklistRowState
  detail: ChecklistDetail | null
  /**
   * done: how long the row took (null when the journal cannot say).
   * active: how long it has been running (null while waiting between steps).
   * pending: null.
   */
  durationMs: number | null
  /** Typical duration used for the bar weight and the time-left estimate. */
  typicalMs: number
}

export interface ChecklistSnapshot {
  rows: ChecklistRow[]
  /** 0..1 across the whole bar, weighted by each row's typical duration. */
  fraction: number
  /** Estimated time left, 0 when done. */
  remainingMs: number
  /** Wall clock since the first journal row of the attempt (0 when unknown). */
  elapsedMs: number
  /** The generate step has run well past what is normal. */
  overdue: boolean
}

export interface StepTiming {
  step: string
  /** ISO created_at of the step's FIRST `started` row. */
  startedAt: string | null
  /** ISO created_at of the step's FIRST `succeeded` row. */
  finishedAt: string | null
}

export interface ChecklistInput {
  mode: CaptureProgressMode
  /** The attempt is confirmed complete (terminal journal outcome). */
  done: boolean
  /** Steps with a journal `succeeded` event. */
  completedSteps: string[]
  /** The step currently running (latest `started` without a `succeeded`). */
  activeStep: string | null
  /** ISO start of the active step (first `started` row). */
  activeStepStartedAt: string | null
  /** Per-step first-started / first-succeeded timestamps. */
  stepTimings?: StepTiming[]
  /** Ordered generate sub-phase visits (buildPhaseVisits). */
  phaseVisits?: GeneratePhaseVisit[]
  /** Photo-analysis coverage from the analyze step. */
  analyzedCount?: number
  totalCount?: number
  failedCount?: number
  /** Live medians: step keys plus `generate_estimate:<phase>` keys. */
  medians?: Record<string, number>
  nowMs: number
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function stepTypical(step: string, medians?: Record<string, number>): number {
  return positiveOr(medians?.[step], FALLBACK_MEDIANS_MS[step] ?? 10_000)
}

function phaseTypical(phase: GeneratePhase, medians?: Record<string, number>): number {
  return positiveOr(medians?.[phaseMedianKey(phase)], GENERATE_PHASE_TYPICAL_MS[phase])
}

/** Asymptotic creep: moves every tick, slows as it passes typical, never arrives. */
function creep(elapsedMs: number, typicalMs: number): number {
  const ratio = Math.max(0, elapsedMs) / typicalMs
  return Math.min(1 - Math.exp(-ratio * 1.2), ACTIVE_FILL_CAP)
}

function toNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Detail for a first-pass generate row, from its visit's merged journal detail. */
function phaseDetail(
  phase: FirstPassPhase,
  state: ChecklistRowState,
  detail: GeneratePhaseDetail | undefined,
  pricingDetail: GeneratePhaseDetail | undefined
): ChecklistDetail | null {
  if (phase === 'drafting') {
    if (state === 'active' && detail) {
      const sections = toNumber(detail.sectionsDrafted)
      if (sections !== undefined && sections > 0) {
        return {
          kind: 'drafting_live',
          sections,
          items: toNumber(detail.itemsDrafted) ?? 0,
          titles: Array.isArray(detail.draftSections) ? detail.draftSections.slice(-3) : [],
        }
      }
    }
    if (state === 'done') {
      // The draft's size is first stated when pricing starts (the pricing
      // entry report carries itemCount/sectionCount of the fresh draft).
      const items = toNumber(pricingDetail?.itemCount) ?? toNumber(detail?.itemsDrafted)
      const sections = toNumber(pricingDetail?.sectionCount) ?? toNumber(detail?.sectionsDrafted)
      if (items !== undefined && sections !== undefined && items > 0) {
        return { kind: 'drafted', items, sections }
      }
    }
    return null
  }
  if (phase === 'pricing' && detail) {
    const candidates = toNumber(detail.candidates)
    const researched = toNumber(detail.researched)
    if (candidates === undefined) return null
    if (candidates === 0) {
      const items = toNumber(detail.itemCount)
      return items !== undefined && items > 0 ? { kind: 'price_book', items } : null
    }
    if (researched !== undefined) return { kind: 'priced', researched, candidates }
    return { kind: 'to_price', candidates }
  }
  return null
}

/**
 * Builds the checklist snapshot from the journal-derived progress payload.
 * See the module doc for the invariants.
 */
export function buildChecklist(input: ChecklistInput): ChecklistSnapshot {
  const { mode, done, medians, nowMs } = input
  const completed = new Set(input.completedSteps)
  const timings = new Map((input.stepTimings ?? []).map((t) => [t.step, t]))
  const visits = input.phaseVisits ?? []
  const steps = STEP_SEQUENCES[mode]

  const rows: ChecklistRow[] = []

  // ── Pipeline steps before generation ──────────────────────────────────────
  for (const step of steps) {
    if (step === 'generate_estimate') continue
    const timing = timings.get(step)
    const started = ms(timing?.startedAt) ?? (input.activeStep === step ? ms(input.activeStepStartedAt) : null)
    const finished = ms(timing?.finishedAt)
    const isDone = done || completed.has(step)
    const isActive = !isDone && input.activeStep === step
    let detail: ChecklistDetail | null = null
    if (
      step === 'analyze' &&
      typeof input.analyzedCount === 'number' &&
      typeof input.totalCount === 'number' &&
      input.totalCount > 0
    ) {
      detail = {
        kind: 'photos',
        analyzed: input.analyzedCount,
        total: input.totalCount,
        failed: input.failedCount ?? 0,
      }
    }
    rows.push({
      id: step as ChecklistRowId,
      state: isDone ? 'done' : isActive ? 'active' : 'pending',
      detail,
      durationMs: isDone
        ? started !== null && finished !== null
          ? Math.max(0, finished - started)
          : null
        : isActive && started !== null
          ? Math.max(0, nowMs - started)
          : null,
      typicalMs: stepTypical(step, medians),
    })
  }

  // ── Generation, one row per sub-phase ─────────────────────────────────────
  const generateTiming = timings.get('generate_estimate')
  const generateStarted =
    ms(generateTiming?.startedAt) ??
    (input.activeStep === 'generate_estimate' ? ms(input.activeStepStartedAt) : null)
  const generateFinished = ms(generateTiming?.finishedAt)
  const generateDone = done || completed.has('generate_estimate')
  const generateActive = !generateDone && input.activeStep === 'generate_estimate'

  const refineIndex = visits.findIndex((v) => v.phase === 'refining')
  const firstPass = refineIndex === -1 ? visits : visits.slice(0, refineIndex)
  const secondPass = refineIndex === -1 ? [] : visits.slice(refineIndex)
  const hasRefine = refineIndex !== -1

  // First visit of each first-pass phase, and the phase the first pass is on.
  const firstVisit = new Map<GeneratePhase, { visit: GeneratePhaseVisit; index: number }>()
  firstPass.forEach((visit, index) => {
    if (!firstVisit.has(visit.phase)) firstVisit.set(visit.phase, { visit, index })
  })
  const lastFirstPassPhase = firstPass.length > 0 ? firstPass[firstPass.length - 1].phase : null
  const lastFirstPassOrder = lastFirstPassPhase
    ? FIRST_PASS_PHASES.indexOf(lastFirstPassPhase as FirstPassPhase)
    : -1

  FIRST_PASS_PHASES.forEach((phase, order) => {
    const entry = firstVisit.get(phase)
    const start = ms(entry?.visit.startedAt) ?? (order === 0 ? generateStarted : null)
    let state: ChecklistRowState
    if (generateDone || hasRefine || order < lastFirstPassOrder) state = 'done'
    else if (generateActive && (order === lastFirstPassOrder || (lastFirstPassOrder === -1 && order === 0)))
      state = 'active'
    else state = 'pending'

    let durationMs: number | null = null
    if (state === 'done' && start !== null && entry) {
      const next = firstPass[entry.index + 1]
      const end =
        ms(next?.startedAt) ?? (hasRefine ? ms(secondPass[0]?.startedAt) : null) ?? generateFinished
      durationMs = end !== null ? Math.max(0, end - start) : null
    } else if (state === 'active' && start !== null) {
      durationMs = Math.max(0, nowMs - start)
    }

    rows.push({
      id: `generate:${phase}`,
      state,
      detail: phaseDetail(phase, state, entry?.visit.detail, firstVisit.get('pricing')?.visit.detail),
      durationMs,
      typicalMs: phaseTypical(phase, medians),
    })
  })

  // The auto-refine second pass only appears once the journal says it began.
  if (hasRefine) {
    const refineStart = ms(secondPass[0].startedAt)
    const current = secondPass[secondPass.length - 1]
    const state: ChecklistRowState = generateDone ? 'done' : generateActive ? 'active' : 'pending'
    rows.push({
      id: 'generate:refining',
      state,
      detail:
        state === 'active'
          ? { kind: 'second_pass', round: toNumber(secondPass[0].detail.round) ?? 1, phase: current.phase }
          : null,
      durationMs:
        refineStart === null
          ? null
          : state === 'done'
            ? generateFinished !== null
              ? Math.max(0, generateFinished - refineStart)
              : null
            : Math.max(0, nowMs - refineStart),
      typicalMs: phaseTypical('refining', medians),
    })
  }

  // ── Monotonicity: the pipeline is strictly ordered ────────────────────────
  // Anything before a row the journal has reached is behind us, even if its own
  // succeeded row is missing (an older server build, a dropped journal write).
  let lastReached = -1
  rows.forEach((r, i) => {
    if (r.state !== 'pending') lastReached = i
  })
  for (let i = 0; i < lastReached; i++) {
    if (rows[i].state !== 'done') {
      rows[i] = { ...rows[i], state: 'done', detail: rows[i].detail, durationMs: null }
    }
  }

  // Between steps (one succeeded, the next not started yet) nothing is active.
  // Show the next row as active anyway: the server IS working on handing off,
  // and a list with no spinner reads as frozen. It has no clock of its own.
  if (!done && !rows.some((r) => r.state === 'active')) {
    const next = rows.findIndex((r) => r.state === 'pending')
    if (next !== -1) rows[next] = { ...rows[next], state: 'active', durationMs: null }
  }

  // ── Bar, time left, elapsed, overdue ──────────────────────────────────────
  const total = rows.reduce((sum, r) => sum + r.typicalMs, 0)
  let filled = 0
  let remaining = 0
  for (const r of rows) {
    if (r.state === 'done') {
      filled += r.typicalMs
    } else if (r.state === 'active') {
      const elapsed = r.durationMs ?? 0
      filled += r.typicalMs * creep(elapsed, r.typicalMs)
      remaining += Math.max(r.typicalMs - elapsed, r.typicalMs * MIN_ACTIVE_REMAINING_SHARE)
    } else {
      remaining += r.typicalMs
    }
  }
  let fraction = total > 0 ? Math.min(filled / total, ACTIVE_FILL_CAP) : 0

  // The bar must never walk backwards, and the second pass would make it: its
  // row adds a whole extra pass to the total the moment it appears. So once it
  // exists, the bar resumes from EXACTLY where it stood when refining began
  // (reconstructed from the journal, not remembered) and creeps the remaining
  // headroom with the second pass's own clock.
  const refineRow = rows.find((r) => r.id === 'generate:refining')
  if (refineRow && refineRow.state === 'active' && hasRefine) {
    const refineStart = ms(secondPass[0].startedAt)
    const reviewing = firstVisit.get('reviewing')?.visit
    const reviewingRow = rows.find((r) => r.id === 'generate:reviewing')
    const firstPassTotal = total - refineRow.typicalMs
    let firstPassFilled = firstPassTotal
    if (reviewing && reviewingRow && refineStart !== null) {
      const reviewedFor = Math.max(0, refineStart - (ms(reviewing.startedAt) ?? refineStart))
      firstPassFilled -= reviewingRow.typicalMs * (1 - creep(reviewedFor, reviewingRow.typicalMs))
    }
    const base = firstPassTotal > 0 ? Math.min(firstPassFilled / firstPassTotal, ACTIVE_FILL_CAP) : 0
    fraction = base + (REFINE_FILL_CAP - base) * creep(refineRow.durationMs ?? 0, refineRow.typicalMs)
  }

  const starts = [
    ...(input.stepTimings ?? []).map((t) => ms(t.startedAt)),
    ms(input.activeStepStartedAt),
  ].filter((v): v is number => v !== null)
  const firstStart = starts.length > 0 ? Math.min(...starts) : null

  const generateTypical = rows
    .filter((r) => r.id.startsWith('generate:') && r.id !== 'generate:refining')
    .reduce((sum, r) => sum + r.typicalMs, 0)
  const overdue =
    generateActive &&
    generateStarted !== null &&
    isGenerateOverdue({
      elapsedMs: nowMs - generateStarted,
      medianMs: generateTypical + (hasRefine ? phaseTypical('refining', medians) : 0),
    })

  return {
    rows,
    fraction: done ? 1 : fraction,
    remainingMs: done ? 0 : remaining,
    elapsedMs: firstStart !== null ? Math.max(0, nowMs - firstStart) : 0,
    overdue,
  }
}
