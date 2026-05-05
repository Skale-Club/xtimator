// Wave 0 scaffold — RED until Phase 18 plan 02 implements CaptureStepper component.
// This test turns GREEN in Phase 18 plan 02 task 1 (presentational components).

import { describe, it, expect, vi } from 'vitest'
import React from 'react'

// CaptureStepper is not yet built — mock the module so the file compiles.
vi.mock('@/components/capture/capture-stepper', () => ({
  CaptureStepper: vi.fn(() => null),
}))

describe('CaptureStepper', () => {
  it('renders 4 stages: Saving / Transcribing / Analyzing / Generating estimate', () => {
    // Implementation pending — Phase 18 plan 02 task 1.
    // Expected: component renders 4 named stages with correct labels.
    expect.fail('Implementation pending — Phase 18 plan 02 task 1')
  })

  it('shows checkmark for done, spinner for active, dot for pending', () => {
    // Implementation pending — Phase 18 plan 02 task 1.
    // Expected: stage status icons match design:
    //   done → Check icon (emerald)
    //   active → Loader2 (animate-spin, primary)
    //   pending → dot (muted)
    expect.fail('Implementation pending — Phase 18 plan 02 task 1')
  })

  it('shows AlertCircle + Retry/Edit manually for failed stage', () => {
    // Implementation pending — Phase 18 plan 02 task 1.
    // Expected: when failedAt is set, the failed stage shows AlertCircle icon and
    //   Retry + Edit manually buttons are visible.
    expect.fail('Implementation pending — Phase 18 plan 02 task 1')
  })

  it('reveals transcript between transcribing and analyzing stages', () => {
    // Implementation pending — Phase 18 plan 02 task 1.
    // Expected: when transcript prop is provided, transcript text is rendered in the UI.
    expect.fail('Implementation pending — Phase 18 plan 02 task 1')
  })
})
