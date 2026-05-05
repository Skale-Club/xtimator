// Wave 0 scaffold — RED until Phase 18 plan 02 implements CaptureRecorder component.
// This test turns GREEN in Phase 18 plan 02 task 1 (presentational components) / task 2 (full-screen recorder).

import { describe, it, expect, vi } from 'vitest'

// CaptureRecorder is not yet built — mock the module so the file compiles.
vi.mock('@/components/capture/capture-recorder', () => ({
  CaptureRecorder: vi.fn(),
  HARD_CAP_MS: 10 * 60 * 1000,
  WARN_AT_MS: 9 * 60 * 1000,
  AMBER_AT_MS: 8 * 60 * 1000,
  RED_AT_MS: 9.5 * 60 * 1000,
}))

describe('capture-recorder warning thresholds (D-07)', () => {
  it('toasts at 9:00 (60s remaining)', () => {
    // Implementation pending — Phase 18 plan 02 task 2.
    // Expected: when elapsedMs >= WARN_AT_MS (9 * 60 * 1000), toast.warning is called once.
    expect.fail('Implementation pending — Phase 18 plan 02 task 2')
  })

  it('color goes neutral (<8min) → amber (8–9.5) → red (>=9.5)', () => {
    // Implementation pending — Phase 18 plan 02 task 2.
    // Expected: colorClass derivation from elapsedMs matches:
    //   < 8min → stroke-blue-500 (neutral)
    //   8min–9.5min → stroke-amber-500
    //   >= 9.5min → stroke-red-500
    expect.fail('Implementation pending — Phase 18 plan 02 task 2')
  })

  it('warns only once (warnedRef prevents duplicate toasts)', () => {
    // Implementation pending — Phase 18 plan 02 task 2.
    expect.fail('Implementation pending — Phase 18 plan 02 task 2')
  })
})
