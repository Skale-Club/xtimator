/**
 * lib/estimate/journal-medians.ts
 *
 * Typical durations for the capture checklist, measured off the journal.
 *
 * Every duration here is a gap between two journal timestamps of the SAME
 * attempt: a step's first `started` row to its first `succeeded` row, and a
 * generate sub-phase's first row to the next phase's first row. That is the
 * wall clock the operator actually waited, which is what the checklist's bar
 * and "time left" line need.
 *
 * Why not `duration_ms`: it is only written on `succeeded` rows, so it can say
 * nothing about sub-phases, and before 260806 the generate step's value was
 * re-stamped on every Inngest replay (a 30s run recorded as 0.3s).
 *
 * Pure module: no I/O. Fully unit-tested in tests/unit/estimate/journal-medians.test.ts.
 */
import {
  buildPhaseVisits,
  phaseMedianKey,
  type PhaseJournalRow,
} from './generation-phases'

export interface MedianJournalRow extends PhaseJournalRow {
  attempt_id: string | null
}

/** Fewer samples than this and a live median is noise; the fallback wins. */
export const MIN_MEDIAN_SAMPLES = 3

/** A gap longer than this is a stuck/abandoned attempt, not a typical run. */
const MAX_PLAUSIBLE_GAP_MS = 20 * 60_000

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  // percentile_disc(0.5): smallest value with cumulative distribution >= 0.5.
  return sorted[Math.ceil(sorted.length * 0.5) - 1]
}

function gap(fromIso: string | undefined, toIso: string | undefined): number | null {
  if (!fromIso || !toIso) return null
  const d = Date.parse(toIso) - Date.parse(fromIso)
  return Number.isFinite(d) && d > 0 && d <= MAX_PLAUSIBLE_GAP_MS ? d : null
}

/**
 * Computes per-step and per-generate-phase medians from raw journal rows of
 * many attempts. Keys: the step name (`transcribe`, `generate_estimate`, …) and
 * `generate_estimate:<phase>` (phaseMedianKey). `generate_estimate:refining`
 * is the whole second pass: refining start to the step's succeeded row.
 *
 * Keys with fewer than MIN_MEDIAN_SAMPLES samples are omitted, so the caller's
 * fallbacks apply to them.
 */
export function computeJournalMedians(rows: MedianJournalRow[]): Record<string, number> {
  const byAttempt = new Map<string, MedianJournalRow[]>()
  for (const r of rows) {
    if (!r.attempt_id) continue
    const list = byAttempt.get(r.attempt_id)
    if (list) list.push(r)
    else byAttempt.set(r.attempt_id, [r])
  }

  const samples = new Map<string, number[]>()
  const add = (key: string, value: number | null) => {
    if (value === null) return
    const list = samples.get(key)
    if (list) list.push(value)
    else samples.set(key, [value])
  }

  for (const attemptRows of byAttempt.values()) {
    attemptRows.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))

    const firstStarted = new Map<string, string>()
    const firstSucceeded = new Map<string, string>()
    for (const r of attemptRows) {
      if (r.status === 'started' && !firstStarted.has(r.step)) firstStarted.set(r.step, r.created_at)
      if (r.status === 'succeeded' && !firstSucceeded.has(r.step)) firstSucceeded.set(r.step, r.created_at)
    }
    for (const [step, startedAt] of firstStarted) {
      add(step, gap(startedAt, firstSucceeded.get(step)))
    }

    const generateEnd = firstSucceeded.get('generate_estimate')
    const visits = buildPhaseVisits(attemptRows)
    const refineIndex = visits.findIndex((v) => v.phase === 'refining')
    const firstPass = refineIndex === -1 ? visits : visits.slice(0, refineIndex)
    const seen = new Set<string>()
    firstPass.forEach((visit, i) => {
      if (seen.has(visit.phase)) return
      seen.add(visit.phase)
      const end = firstPass[i + 1]?.startedAt ?? (refineIndex !== -1 ? visits[refineIndex].startedAt : generateEnd)
      add(phaseMedianKey(visit.phase), gap(visit.startedAt, end))
    })
    if (refineIndex !== -1) {
      add(phaseMedianKey('refining'), gap(visits[refineIndex].startedAt, generateEnd))
    }
  }

  const out: Record<string, number> = {}
  for (const [key, values] of samples) {
    if (values.length >= MIN_MEDIAN_SAMPLES) out[key] = median(values)
  }
  return out
}
