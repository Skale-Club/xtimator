/**
 * Watched-range bookkeeping for the Academy video tracker.
 *
 * A range is `[start, end]` in whole seconds of the video timeline. Only time
 * that was actually PLAYED is recorded, so seeking to the end of a video adds
 * nothing. Ranges are kept merged, sorted and non-overlapping.
 */
export type WatchedRange = [number, number]

/** Hard cap on stored ranges so a hostile client cannot grow the jsonb. */
export const MAX_RANGES = 200

function normalise(range: readonly [number, number]): WatchedRange | null {
  // Round (not floor/ceil) so back-to-back ~1 s player ticks do not inflate the total.
  const start = Math.round(Number(range[0]))
  const end = Math.round(Number(range[1]))
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start < 0 || end <= start) return null
  return [start, end]
}

/** Merge overlapping or touching ranges; drops invalid entries. */
export function mergeRanges(ranges: ReadonlyArray<readonly [number, number]>): WatchedRange[] {
  const clean = ranges
    .map(normalise)
    .filter((r): r is WatchedRange => r !== null)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])

  const merged: WatchedRange[] = []
  for (const [start, end] of clean) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end)
    } else {
      merged.push([start, end])
    }
  }
  return merged
}

/** Clamp every range to the video duration (when known) and merge. */
export function clampRanges(
  ranges: ReadonlyArray<readonly [number, number]>,
  durationSeconds: number | null,
): WatchedRange[] {
  const bounded =
    durationSeconds && durationSeconds > 0
      ? ranges.map((r): [number, number] => [
          Math.min(Number(r[0]), durationSeconds),
          Math.min(Number(r[1]), durationSeconds),
        ])
      : [...ranges]
  return mergeRanges(bounded).slice(0, MAX_RANGES)
}

/** Total seconds covered by a set of ranges (merged first, so no double count). */
export function sumRanges(ranges: ReadonlyArray<readonly [number, number]>): number {
  return mergeRanges(ranges).reduce((total, [start, end]) => total + (end - start), 0)
}

/** Fraction (0..1) of the video that was watched. */
export function watchedFraction(
  ranges: ReadonlyArray<readonly [number, number]>,
  durationSeconds: number | null,
): number {
  if (!durationSeconds || durationSeconds <= 0) return 0
  return Math.min(1, sumRanges(clampRanges(ranges, durationSeconds)) / durationSeconds)
}

/** Parse the jsonb column defensively. */
export function parseStoredRanges(value: unknown): WatchedRange[] {
  if (!Array.isArray(value)) return []
  const pairs: Array<[number, number]> = []
  for (const item of value) {
    if (Array.isArray(item) && item.length === 2) pairs.push([Number(item[0]), Number(item[1])])
  }
  return mergeRanges(pairs)
}

export interface RecorderState {
  /** Player position at the previous tick, null before the first tick or after a seek. */
  last: number | null
  ranges: WatchedRange[]
}

/**
 * Advance the recorder by one player tick (called ~1x per second while playing).
 *
 * A forward step of at most `maxStep` seconds is treated as normal playback
 * (covers 2x speed plus jitter) and recorded. Anything else - a seek forward,
 * a seek back, a stall - only moves the cursor, so jumping to the end of a video
 * records nothing.
 */
export function recordTick(state: RecorderState, current: number, maxStep = 3): RecorderState {
  if (!Number.isFinite(current) || current < 0) return { last: null, ranges: state.ranges }
  const { last } = state
  if (last != null) {
    const step = current - last
    if (step > 0 && step <= maxStep) {
      return { last: current, ranges: mergeRanges([...state.ranges, [last, current]]) }
    }
  }
  return { last: current, ranges: state.ranges }
}
