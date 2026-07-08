import { describe, it, expect } from 'vitest'

/**
 * 260707-ru5: computeElapsedMs is the pure pause-aware clock helper backing
 * capture-recorder.tsx's tick()/stopRecording()/pauseRecording()/resumeRecording().
 * accumulatedMs = sum of every already-recorded segment. segmentStartMs = the
 * performance.now() the CURRENT segment started at (null = paused/idle — no
 * live segment to add). Elapsed therefore only ever counts actually-recorded
 * time, never wall-clock time spent paused.
 */

import { computeElapsedMs, HARD_CAP_MS } from '@/components/capture/capture-recorder'

describe('computeElapsedMs (260707-ru5)', () => {
  it('live segment: accumulated + (now - segmentStart)', () => {
    expect(computeElapsedMs(0, 1000, 5000)).toBe(4000)
  })

  it('frozen while paused: segmentStartMs null ignores nowMs entirely', () => {
    expect(computeElapsedMs(4000, null, 999_999)).toBe(4000)
  })

  it('resumed: accumulated carries over, new segment adds only its own delta', () => {
    expect(computeElapsedMs(4000, 10_000, 12_000)).toBe(6000)
  })

  it('idle/never-started: accumulated 0, segmentStart null → 0 regardless of now', () => {
    expect(computeElapsedMs(0, null, 123_456)).toBe(0)
  })

  it('multi-cycle: record → pause → resume → pause → resume, elapsed only sums recorded spans', () => {
    // Segment 1: 0 -> 1000 (1000ms recorded)
    let accumulated = 0
    let segmentStart: number | null = 0
    accumulated = computeElapsedMs(accumulated, segmentStart, 1000) // 1000
    segmentStart = null // pause

    // Paused for a long wall-clock stretch — no effect on accumulated.
    expect(computeElapsedMs(accumulated, segmentStart, 500_000)).toBe(1000)

    // Segment 2: resume at 5000, record until 7000 (2000ms recorded)
    segmentStart = 5000
    accumulated = computeElapsedMs(accumulated, segmentStart, 7000) // 1000 + 2000 = 3000
    segmentStart = null // pause again

    expect(computeElapsedMs(accumulated, segmentStart, 999_999)).toBe(3000)

    // Segment 3: resume at 10_000, record until 10_500 (500ms recorded)
    segmentStart = 10_000
    const finalElapsed = computeElapsedMs(accumulated, segmentStart, 10_500)
    expect(finalElapsed).toBe(3500) // 1000 + 2000 + 500
  })

  it('hard cap counts only recorded time — a long pause never triggers it early or late', () => {
    // 9:50 of ACTUAL recorded time, then paused for a huge wall-clock gap.
    const accumulated = 590_000 // 9:50
    const frozenElapsed = computeElapsedMs(accumulated, null, accumulated + 999_999_999)
    expect(frozenElapsed).toBe(590_000)
    expect(frozenElapsed).toBeLessThan(HARD_CAP_MS)

    // Resume and record 10s more — cap fires only once RECORDED time reaches
    // 10:00, ~250ms (one tick) after resuming, independent of the wall-clock
    // gap the pause introduced.
    const resumedAt = 999_999_999
    const capElapsed = computeElapsedMs(accumulated, resumedAt, resumedAt + 10_000)
    expect(capElapsed).toBe(600_000)
    expect(capElapsed).toBeGreaterThanOrEqual(HARD_CAP_MS)
  })
})
