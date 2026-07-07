import { describe, it, expect } from 'vitest'

/**
 * 260707-grq (P0 hotfix): finalizeDurationSeconds() is the belt-and-braces
 * clamp that guarantees createRecording() never receives a duration the
 * server's B10 validation would reject (client sent stale-closure 0 in
 * production since commit c3385be7). MIN_RECORDING_MS gates the client-side
 * pre-flight check in runPipeline (components/capture/capture-recorder.tsx).
 */

import { finalizeDurationSeconds, MIN_RECORDING_MS } from '@/components/capture/capture-recorder'

describe('finalizeDurationSeconds (260707-grq)', () => {
  it('clamps 0ms to 1s (belt-and-braces — the exact production failure mode)', () => {
    expect(finalizeDurationSeconds(0)).toBe(1)
  })

  it('clamps a sub-second elapsed (999ms) to 1s', () => {
    expect(finalizeDurationSeconds(999)).toBe(1)
  })

  it('rounds exactly 1000ms down to 1s', () => {
    expect(finalizeDurationSeconds(1000)).toBe(1)
  })

  it('floors a typical multi-minute take (65_900ms) to 65s', () => {
    expect(finalizeDurationSeconds(65_900)).toBe(65)
  })

  it('floors the 10-minute hard-cap take (600_000ms) to 600s — well within the server MAX (900s)', () => {
    expect(finalizeDurationSeconds(600_000)).toBe(600)
  })
})

describe('MIN_RECORDING_MS (260707-grq)', () => {
  it('is 1000ms — the pre-flight hardening threshold', () => {
    expect(MIN_RECORDING_MS).toBe(1000)
  })
})
