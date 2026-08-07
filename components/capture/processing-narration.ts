/**
 * components/capture/processing-narration.ts
 *
 * The words the capture overlay says while the pipeline works.
 *
 * Two layers, deliberately separated:
 *
 *  1. LABELS + DETAILS: literal truth. A label is only ever shown for a phase
 *     the journal says the server actually entered, and a detail line only ever
 *     prints counts the server actually reported ("18 of 38 items priced").
 *     Never invent, never round up, never show a count you did not receive.
 *
 *  2. QUIPS: the ambient line underneath. Openly flavour, a foreman's inner
 *     monologue, rotating every few seconds so the screen has a pulse during
 *     the long stretches. Quips carry NO information, which is exactly why they
 *     are allowed to be playful, since nothing a user could act on is encoded in
 *     them. Each pool is scoped to its phase, so even the joke is about the
 *     right thing.
 *
 * Why this exists at all: `generate_estimate` routinely runs for minutes (4m40s
 * on the 2026-08-06 production audio attempt) and the overlay used to show one
 * frozen word for the whole stretch. A still screen reads as a broken screen.
 *
 * Pure module: no React, no clock reads. The rotation index is derived from an
 * elapsed value the caller passes in, so it is deterministic and testable.
 */
import type { GeneratePhase, GeneratePhaseDetail } from '@/lib/estimate/generation-phases'

/** How long each quip stays on screen. Slow enough to read, fast enough to feel alive. */
export const QUIP_ROTATE_MS = 4_500

/**
 * Phase → headline. Plain, concrete, and about the WORK, not about the
 * software: an operator on a job site should recognise every one of these as
 * something they'd do themselves.
 */
export const GENERATE_PHASE_LABELS: Record<GeneratePhase, string> = {
  context: 'Reading the job details',
  drafting: 'Writing the scope of work',
  pricing: 'Pricing the line items',
  reviewing: 'Checking the numbers',
  refining: 'Adding more detail',
  saving: 'Putting the estimate together',
}

/**
 * Quip pools, keyed by generate phase and by the coarse pipeline steps that
 * have no sub-phases of their own. Order within a pool is the rotation order.
 */
export const GENERATE_PHASE_QUIPS: Record<GeneratePhase, string[]> = {
  context: [
    'Unrolling the blueprints',
    'Putting the tool belt on',
    'Looking for the tape measure',
  ],
  drafting: [
    'Walking the job in my head',
    'Talking it over with the crew',
    'Writing it up line by line',
    'Thinking like a foreman',
  ],
  pricing: [
    'Calling around for prices',
    'Haggling with the supply house',
    'Checking what this costs around here',
  ],
  reviewing: [
    'Measuring twice',
    'Squinting at the math',
    'Looking for anything forgotten',
  ],
  refining: [
    'Going back for a second look',
    'Filling in what the first pass missed',
    'Being more specific this time',
  ],
  saving: [
    'Stapling the pages together',
    'Sweeping up the job site',
    'Making it presentable',
  ],
}

export const STEP_QUIPS: Record<string, string[]> = {
  save_recording: ['Filing the paperwork', 'Putting the notes somewhere safe'],
  transcribe: [
    'Listening to the walkthrough',
    'Turning the mumbling into words',
    'Rewinding the tricky part',
  ],
  analyze: ['Squinting at the photos', 'Zooming in on the details', 'Counting what is in frame'],
  generate_estimate: GENERATE_PHASE_QUIPS.drafting,
}

/**
 * Picks the quip for a moment in time. Deterministic in `elapsedMs`, so the
 * overlay's existing 250ms re-render tick drives the rotation with no extra
 * state and no timers of its own. Returns null for an unknown/empty pool, so
 * callers render nothing rather than a placeholder.
 */
export function pickQuip(pool: string[] | undefined, elapsedMs: number): string | null {
  if (!pool || pool.length === 0) return null
  const slot = Math.floor(Math.max(0, elapsedMs) / QUIP_ROTATE_MS)
  return pool[slot % pool.length]
}

/**
 * Elapsed time as a clock, not as a raw second count.
 *
 * `148s` was accurate and unreadable: past a minute nobody converts it in their
 * head, and the string grows a digit at exactly the moment the operator is
 * getting anxious about it. `2:28` is the format every stopwatch, timer and
 * media player already uses, so it needs no reading at all.
 *
 * Always zero-padded to m:ss so the width only changes at 10 minutes, which
 * (with tabular figures) keeps the digits from jittering as the clock ticks.
 * Rolls over to h:mm:ss rather than printing a three-digit minute count.
 */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * The factual detail line for a generate phase, as a template plus its real
 * numbers, or null when the server reported nothing worth showing.
 *
 * Returns the pieces rather than a finished string because the caller has to
 * run each literal through `t()` for translation; the numbers are interpolated
 * on the caller's side, after translation.
 */
export type PhaseDetailLine =
  | { kind: 'priced'; researched: number; candidates: number }
  | { kind: 'to_price'; candidates: number }
  | { kind: 'items'; itemCount: number; sectionCount: number }
  | { kind: 'round'; round: number }

export function phaseDetailLine(
  phase: GeneratePhase,
  detail: GeneratePhaseDetail | undefined
): PhaseDetailLine | null {
  if (!detail) return null
  if (phase === 'pricing') {
    // Exit report (researched present) beats the entry report, since it is the
    // stronger fact. Zero candidates means every line matched the price book,
    // which is worth saying nothing about rather than saying "0 of 0".
    if (typeof detail.researched === 'number' && typeof detail.candidates === 'number') {
      return detail.candidates > 0
        ? { kind: 'priced', researched: detail.researched, candidates: detail.candidates }
        : null
    }
    if (typeof detail.candidates === 'number' && detail.candidates > 0) {
      return { kind: 'to_price', candidates: detail.candidates }
    }
    return null
  }
  if (phase === 'refining' && typeof detail.round === 'number') {
    return { kind: 'round', round: detail.round }
  }
  if (
    phase === 'saving' &&
    typeof detail.itemCount === 'number' &&
    typeof detail.sectionCount === 'number' &&
    detail.itemCount > 0
  ) {
    return { kind: 'items', itemCount: detail.itemCount, sectionCount: detail.sectionCount }
  }
  return null
}
