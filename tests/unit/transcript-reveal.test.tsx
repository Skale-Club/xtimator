// Wave 0 scaffold — RED until Phase 18 plan 02 implements CaptureStepper component.
// This test turns GREEN in Phase 18 plan 02 task 1 (presentational components).

import { describe, it, expect, vi } from 'vitest'
import React from 'react'

// CaptureStepper is not yet built — mock the module so the file compiles.
vi.mock('@/components/capture/capture-stepper', () => ({
  CaptureStepper: vi.fn(() => null),
}))

describe('transcript reveal (D-11)', () => {
  it('shows transcript text once provided as prop', () => {
    // Implementation pending — Phase 18 plan 02 task 1.
    // Expected: when CaptureStepper receives transcript="Hello world", the text is visible.
    expect.fail('Implementation pending — Phase 18 plan 02 task 1')
  })

  it('does NOT show transcript section when transcript is empty string', () => {
    // Implementation pending — Phase 18 plan 02 task 1.
    // Expected: when transcript="" or undefined, transcript block is not rendered.
    expect.fail('Implementation pending — Phase 18 plan 02 task 1')
  })
})
