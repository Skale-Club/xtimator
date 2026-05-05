// Phase 18 plan 02 task 1 — transcript reveal in CaptureStepper (D-11).
// Replaced Wave 0 stubs with real assertions against the built component.

import { describe, it, expect } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { CaptureStepper } from '@/components/capture/capture-stepper'

describe('transcript reveal (D-11)', () => {
  it('shows transcript text once provided as prop', () => {
    render(<CaptureStepper currentStage="analyzing" transcript="Hello world" />)
    const block = screen.getByTestId('capture-transcript')
    expect(block).toBeDefined()
    expect(block.textContent).toContain('Hello world')
  })

  it('does NOT show transcript section when transcript is empty string', () => {
    render(<CaptureStepper currentStage="analyzing" transcript="" />)
    expect(screen.queryByTestId('capture-transcript')).toBeNull()
  })

  it('does NOT show transcript section when transcript is undefined', () => {
    render(<CaptureStepper currentStage="analyzing" />)
    expect(screen.queryByTestId('capture-transcript')).toBeNull()
  })
})
