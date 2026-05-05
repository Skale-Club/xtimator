// Phase 18 plan 02 task 1 — CaptureStepper presentational component tests.
// Replaced Wave 0 stubs with real assertions against the built component.

import { describe, it, expect } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { CaptureStepper, STAGE_LABELS } from '@/components/capture/capture-stepper'

describe('CaptureStepper', () => {
  it('renders 4 stages: Saving / Transcribing / Analyzing / Generating estimate', () => {
    render(<CaptureStepper currentStage="idle" />)
    expect(screen.getByText('Saving recording')).toBeDefined()
    expect(screen.getByText('Transcribing')).toBeDefined()
    expect(screen.getByText('Analyzing')).toBeDefined()
    expect(screen.getByText('Generating estimate')).toBeDefined()
  })

  it('shows checkmark for done, spinner for active, dot for pending', () => {
    render(<CaptureStepper currentStage="transcribing" />)
    // saving is done (index 0 < currentIdx 1)
    expect(screen.getByTestId('stage-saving-done')).toBeDefined()
    // transcribing is active
    expect(screen.getByTestId('stage-transcribing-active')).toBeDefined()
    // analyzing and generating are pending
    expect(screen.getByTestId('stage-analyzing-pending')).toBeDefined()
    expect(screen.getByTestId('stage-generating-pending')).toBeDefined()
  })

  it('shows AlertCircle for failed stage', () => {
    render(<CaptureStepper currentStage="transcribing" failedAt="transcribing" />)
    expect(screen.getByTestId('stage-transcribing-failed')).toBeDefined()
  })

  it('reveals transcript between transcribing and analyzing stages', () => {
    render(<CaptureStepper currentStage="analyzing" transcript="This is the job site description." />)
    const transcriptEl = screen.getByTestId('capture-transcript')
    expect(transcriptEl).toBeDefined()
    expect(transcriptEl.textContent).toContain('This is the job site description.')
  })

  it('does NOT render transcript block when transcript prop is absent', () => {
    render(<CaptureStepper currentStage="analyzing" />)
    expect(screen.queryByTestId('capture-transcript')).toBeNull()
  })

  it('STAGE_LABELS contains all 4 expected labels', () => {
    expect(STAGE_LABELS.saving).toBe('Saving recording')
    expect(STAGE_LABELS.transcribing).toBe('Transcribing')
    expect(STAGE_LABELS.analyzing).toBe('Analyzing')
    expect(STAGE_LABELS.generating).toBe('Generating estimate')
  })
})
