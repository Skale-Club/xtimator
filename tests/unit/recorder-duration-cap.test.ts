// Wave 0 scaffold — RED until Phase 18 plan 02 implements CaptureRecorder component.
// This test turns GREEN in Phase 18 plan 02 task 2 (full-screen CaptureRecorder + auto-fire orchestration).

import { describe, it, expect, vi } from 'vitest'

// CaptureRecorder is not yet built — mock the module so the file compiles.
vi.mock('@/components/capture/capture-recorder', () => ({
  CaptureRecorder: vi.fn(),
  HARD_CAP_MS: 10 * 60 * 1000,
  WARN_AT_MS: 9 * 60 * 1000,
}))

describe('capture-recorder duration cap', () => {
  it('auto-stops at 10:00 elapsed', () => {
    // Implementation pending — Phase 18 plan 02 task 2.
    // Expected: when performance.now() - startTimeRef.current >= HARD_CAP_MS, stopRecording() is called.
    expect.fail('Implementation pending — Phase 18 plan 02 task 2')
  })

  it('uses performance.now() baseline (not setInterval counter)', () => {
    // Implementation pending — Phase 18 plan 02 task 2.
    // Expected: timer logic references performance.now(), not a counter incremented per tick.
    expect.fail('Implementation pending — Phase 18 plan 02 task 2')
  })

  it('HARD_CAP_MS constant equals 600000 (10 minutes)', () => {
    // This is a static constant check that will pass once the module is built.
    expect.fail('Implementation pending — Phase 18 plan 02 task 2')
  })
})
