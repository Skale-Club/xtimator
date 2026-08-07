import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * 260806: the capture overlay's narration during `generate_estimate`.
 *
 * The complaint that started this: a real production run spent 4m40s of its
 * 5m03s inside `generate_estimate` showing one frozen label, and the operator
 * read a working system as a hung one. These tests pin what the overlay says
 * now, and (just as importantly) that the playful half stays decorative:
 * the label and the counts come from the journal, the quip carries nothing.
 *
 * t() is mocked to the repo's `__t(<key>)__` sentinel convention
 * (capture-failure.test.tsx) so every user-visible string is proven to flow
 * through translation rather than being hardcoded English.
 */

// useAppTranslation, not useTranslation: the overlay follows the APP language
// rather than the estimate language it would inherit from the New Xtimate
// popup's ScopedLanguageProvider. Mocking the wrong hook here would let a
// regression back to useTranslation pass unnoticed.
vi.mock('@/lib/i18n/use-translation', () => ({
  useAppTranslation: () => ({
    t: (key: string) => `__t(${key})__`,
    language: 'en',
  }),
}))

vi.mock('@/components/ui/tower-loader', () => ({
  TowerLoader: () => <div data-testid="tower-loader" />,
}))

import { CaptureProcessingOverlay } from '@/components/capture/capture-processing-overlay'
import {
  QUIP_ROTATE_MS,
  GENERATE_PHASE_QUIPS,
  formatElapsed,
} from '@/components/capture/processing-narration'
import { GENERATE_OVERDUE_FLOOR_MS } from '@/lib/estimate/generation-phases'

const NOW = Date.parse('2026-08-06T21:53:00Z')

/** Renders the overlay mid-generation, `phaseAgeMs` into the given phase. */
function renderGenerating(opts: {
  phase: 'context' | 'drafting' | 'pricing' | 'reviewing' | 'refining' | 'saving'
  furthestPhase?: 'context' | 'drafting' | 'pricing' | 'reviewing' | 'refining' | 'saving'
  phaseAgeMs?: number
  stepAgeMs?: number
  detail?: Record<string, number>
}) {
  const { phase, furthestPhase = phase, phaseAgeMs = 0, stepAgeMs = 30_000, detail } = opts
  return render(
    <CaptureProcessingOverlay
      stage="generating"
      mode="audio"
      completedSteps={['save_recording', 'transcribe']}
      activeStep="generate_estimate"
      activeStepStartedAt={new Date(NOW - stepAgeMs).toISOString()}
      generatePhase={{
        phase,
        furthestPhase,
        startedAt: new Date(NOW - phaseAgeMs).toISOString(),
        detail,
      }}
    />
  )
}

describe('formatElapsed', () => {
  it('reads as a clock rather than a raw second count', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(7_400)).toBe('0:07')
    expect(formatElapsed(59_999)).toBe('0:59')
    expect(formatElapsed(60_000)).toBe('1:00')
    expect(formatElapsed(148_000)).toBe('2:28')
    expect(formatElapsed(303_000)).toBe('5:03')
  })

  it('holds a stable width through the first ten minutes', () => {
    // Tabular figures only stop the digits jittering if the string length is
    // stable too, so every value below 10:00 must be exactly four characters.
    for (const seconds of [0, 9, 59, 60, 61, 599]) {
      expect(formatElapsed(seconds * 1000)).toHaveLength(4)
    }
  })

  it('rolls over to hours instead of printing a three-digit minute', () => {
    expect(formatElapsed(3_600_000)).toBe('1:00:00')
    expect(formatElapsed(3_725_000)).toBe('1:02:05')
  })

  it('never renders a negative clock from a skewed timestamp', () => {
    expect(formatElapsed(-5_000)).toBe('0:00')
  })
})

describe('CaptureProcessingOverlay: generate phase narration (260806)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('names the reported phase instead of the generic step label', () => {
    renderGenerating({ phase: 'pricing' })
    const label = screen.getByTestId('capture-processing-label').textContent ?? ''
    expect(label).toContain('__t(Pricing the line items)__')
    expect(label).not.toContain('Generating estimate')
  })

  it('falls back to the plain step label when no phase has been reported', () => {
    render(
      <CaptureProcessingOverlay
        stage="generating"
        mode="audio"
        completedSteps={['save_recording', 'transcribe']}
        activeStep="generate_estimate"
        activeStepStartedAt={new Date(NOW - 5_000).toISOString()}
      />
    )
    expect(screen.getByTestId('capture-processing-label').textContent).toContain(
      '__t(Generating estimate)__'
    )
  })

  it('keeps the elapsed clock on the step, not on the phase', () => {
    // 200s into the step, 3s into the current phase. The operator wants to
    // know how long THE ESTIMATE has been running.
    renderGenerating({ phase: 'saving', phaseAgeMs: 3_000, stepAgeMs: 200_000 })
    expect(screen.getByTestId('capture-processing-elapsed').textContent).toBe('3:20')
  })

  it('keeps the clock out of the label so the phase name reads as prose', () => {
    renderGenerating({ phase: 'saving', stepAgeMs: 200_000 })
    expect(screen.getByTestId('capture-processing-label').textContent).toBe(
      '__t(Putting the estimate together)__'
    )
  })

  it('prints the real researched/candidate counts during pricing', () => {
    renderGenerating({ phase: 'pricing', detail: { candidates: 38, researched: 12 } })
    expect(screen.getByTestId('capture-processing-coverage').textContent).toBe(
      '12 __t(of)__ 38 __t(items priced)__'
    )
  })

  it('shows the pending candidate count before research resolves', () => {
    renderGenerating({ phase: 'pricing', detail: { candidates: 38 } })
    expect(screen.getByTestId('capture-processing-coverage').textContent).toBe(
      '38 __t(items to price)__'
    )
  })

  it('shows no count line when the server reported no counts', () => {
    renderGenerating({ phase: 'drafting' })
    expect(screen.queryByTestId('capture-processing-coverage')).toBeNull()
  })

  it('explains a second pass rather than silently replaying drafting', () => {
    renderGenerating({ phase: 'refining', furthestPhase: 'refining', detail: { round: 1 } })
    expect(screen.getByTestId('capture-processing-label').textContent).toContain(
      '__t(Adding more detail)__'
    )
    expect(screen.getByTestId('capture-processing-coverage').textContent).toBe('__t(Pass)__ 2')
  })

  it('rotates the quip within the live phase pool as the phase runs', () => {
    const first = renderGenerating({ phase: 'drafting', phaseAgeMs: 0 })
    const firstQuip = screen.getByTestId('capture-processing-quip').textContent
    first.unmount()

    renderGenerating({ phase: 'drafting', phaseAgeMs: QUIP_ROTATE_MS + 100 })
    const secondQuip = screen.getByTestId('capture-processing-quip').textContent

    expect(firstQuip).not.toBe(secondQuip)
    // Both come from the drafting pool, so the joke is about the right thing.
    const pool = GENERATE_PHASE_QUIPS.drafting.map((q) => `__t(${q})__…`)
    expect(pool).toContain(firstQuip)
    expect(pool).toContain(secondQuip)
  })

  it('does not show a quip once the attempt is done', () => {
    render(
      <CaptureProcessingOverlay
        stage="done"
        mode="audio"
        completedSteps={['save_recording', 'transcribe', 'generate_estimate']}
        activeStep={null}
        activeStepStartedAt={null}
      />
    )
    expect(screen.queryByTestId('capture-processing-quip')).toBeNull()
  })

  it('stays quiet about being slow during a normal-length run', () => {
    renderGenerating({ phase: 'drafting', stepAgeMs: 40_000 })
    expect(screen.queryByTestId('capture-processing-overdue')).toBeNull()
  })

  it('says out loud when the run has gone long instead of just freezing', () => {
    renderGenerating({ phase: 'pricing', stepAgeMs: GENERATE_OVERDUE_FLOOR_MS + 60_000 })
    expect(screen.getByTestId('capture-processing-overdue').textContent).toBe(
      '__t(Bigger job than usual, still working on it)__'
    )
  })

  it('never fills the generate segment to completion, however long the phase runs', () => {
    renderGenerating({ phase: 'saving', phaseAgeMs: 10 * 60_000, stepAgeMs: 15 * 60_000 })
    const segment = screen.getByTestId('capture-progress-segment-generate_estimate')
    expect(segment.getAttribute('data-state')).toBe('active')
    expect(parseFloat(segment.style.width)).toBeLessThan(100)
  })
})
