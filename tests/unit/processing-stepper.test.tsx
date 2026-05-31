// Phase 18 plan 02 task 1 — CaptureStepper presentational component tests.
// Replaced Wave 0 stubs with real assertions against the built component.

import { describe, it, expect } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { CaptureStepper, STAGE_LABELS } from '@/components/capture/capture-stepper'

describe('CaptureStepper', () => {
  it('renders all 4 audio stages by default (no mode prop)', () => {
    render(<CaptureStepper currentStage="idle" />)
    expect(screen.getByText('Saving recording')).toBeDefined()
    expect(screen.getByText('Transcribing')).toBeDefined()
    expect(screen.getByText('Analyzing')).toBeDefined()
    expect(screen.getByText('Generating estimate')).toBeDefined()
  })

  it('shows checkmark for done, spinner for active, dot for pending', () => {
    render(<CaptureStepper currentStage="transcribing" mode="audio" />)
    // saving is done (index 0 < currentIdx 1)
    expect(screen.getByTestId('stage-saving-done')).toBeDefined()
    // transcribing is active
    expect(screen.getByTestId('stage-transcribing-active')).toBeDefined()
    // analyzing and generating are pending
    expect(screen.getByTestId('stage-analyzing-pending')).toBeDefined()
    expect(screen.getByTestId('stage-generating-pending')).toBeDefined()
  })

  it('shows AlertCircle for failed stage', () => {
    render(<CaptureStepper currentStage="transcribing" failedAt="transcribing" mode="audio" />)
    expect(screen.getByTestId('stage-transcribing-failed')).toBeDefined()
  })

  it('reveals transcript between transcribing and analyzing stages', () => {
    render(<CaptureStepper currentStage="analyzing" transcript="This is the job site description." mode="audio" />)
    const transcriptEl = screen.getByTestId('capture-transcript')
    expect(transcriptEl).toBeDefined()
    expect(transcriptEl.textContent).toContain('This is the job site description.')
  })

  it('does NOT render transcript block when transcript prop is absent', () => {
    render(<CaptureStepper currentStage="analyzing" mode="audio" />)
    expect(screen.queryByTestId('capture-transcript')).toBeNull()
  })

  it('STAGE_LABELS contains all 4 expected labels', () => {
    expect(STAGE_LABELS.saving).toBe('Saving recording')
    expect(STAGE_LABELS.transcribing).toBe('Transcribing')
    expect(STAGE_LABELS.analyzing).toBe('Analyzing')
    expect(STAGE_LABELS.generating).toBe('Generating estimate')
  })

  // Mode-aware stage filtering — added when the popup gained text/photos paths.
  // Showing "Transcribing" for a typed description lied about work that never ran.
  describe('mode-aware stages', () => {
    it('text mode renders ONLY saving + generating (no transcribing, no analyzing)', () => {
      render(<CaptureStepper currentStage="generating" mode="text" />)
      expect(screen.getByText('Saving description')).toBeDefined()
      expect(screen.getByText('Generating estimate')).toBeDefined()
      expect(screen.queryByText('Transcribing')).toBeNull()
      expect(screen.queryByText('Analyzing')).toBeNull()
    })

    it('photos mode renders saving + analyzing + generating (no transcribing)', () => {
      render(<CaptureStepper currentStage="analyzing" mode="photos" />)
      expect(screen.getByText('Saving photos')).toBeDefined()
      expect(screen.getByText('Analyzing photos')).toBeDefined()
      expect(screen.getByText('Generating estimate')).toBeDefined()
      expect(screen.queryByText('Transcribing')).toBeNull()
    })

    it('text mode marks saving done when stage advances to generating', () => {
      render(<CaptureStepper currentStage="generating" mode="text" />)
      expect(screen.getByTestId('stage-saving-done')).toBeDefined()
      expect(screen.getByTestId('stage-generating-active')).toBeDefined()
    })

    it('photos mode treats saving as already done when current stage is analyzing', () => {
      render(<CaptureStepper currentStage="analyzing" mode="photos" />)
      expect(screen.getByTestId('stage-saving-done')).toBeDefined()
      expect(screen.getByTestId('stage-analyzing-active')).toBeDefined()
      expect(screen.getByTestId('stage-generating-pending')).toBeDefined()
    })
  })
})
