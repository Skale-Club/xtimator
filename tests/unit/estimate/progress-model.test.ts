import { describe, it, expect } from 'vitest'

/**
 * 260707-o7a: computeProgress — the pure model behind the REAL journal-driven
 * progress bar. Honesty invariants under test:
 *   - a segment is `done` ONLY via a journal succeeded event (completedSteps),
 *   - an active segment can NEVER reach fill 1 without confirmation
 *     (hard-capped at ACTIVE_FILL_CAP), no matter how much time elapses,
 *   - segment sequences match each capture mode's real pipeline steps.
 */
import {
  computeProgress,
  STEP_SEQUENCES,
  FALLBACK_MEDIANS_MS,
  ACTIVE_FILL_CAP,
} from '@/lib/estimate/progress-model'

describe('260707-o7a: computeProgress', () => {
  it('all pending -> fraction 0, every segment pending at fill 0', () => {
    const { fraction, segments } = computeProgress({
      mode: 'audio',
      completedSteps: [],
      activeStep: null,
      activeStepElapsedMs: 0,
    })
    expect(fraction).toBe(0)
    expect(segments).toHaveLength(3)
    for (const seg of segments) {
      expect(seg.state).toBe('pending')
      expect(seg.fill).toBe(0)
    }
  })

  it('first step done (audio mode) -> fraction exactly 1/3', () => {
    const { fraction, segments } = computeProgress({
      mode: 'audio',
      completedSteps: ['save_recording'],
      activeStep: null,
      activeStepElapsedMs: 0,
    })
    expect(fraction).toBeCloseTo(1 / 3, 10)
    expect(segments[0]).toEqual({ step: 'save_recording', state: 'done', fill: 1 })
    expect(segments[1].state).toBe('pending')
    expect(segments[2].state).toBe('pending')
  })

  it('active step at elapsed === median -> fill capped at ACTIVE_FILL_CAP (never 1 without confirmation)', () => {
    const { segments } = computeProgress({
      mode: 'audio',
      completedSteps: ['save_recording'],
      activeStep: 'transcribe',
      activeStepElapsedMs: FALLBACK_MEDIANS_MS.transcribe, // raw ratio = 1.0
    })
    const active = segments.find((s) => s.step === 'transcribe')!
    expect(active.state).toBe('active')
    expect(active.fill).toBe(ACTIVE_FILL_CAP)
    expect(active.fill).toBeLessThan(1)
  })

  it('elapsed far beyond median stays capped — the bar WAITS for the journal', () => {
    const { segments, fraction } = computeProgress({
      mode: 'audio',
      completedSteps: ['save_recording', 'transcribe'],
      activeStep: 'generate_estimate',
      activeStepElapsedMs: FALLBACK_MEDIANS_MS.generate_estimate * 100,
    })
    const active = segments.find((s) => s.step === 'generate_estimate')!
    expect(active.fill).toBe(ACTIVE_FILL_CAP)
    // Whole bar can never read complete without the final succeeded event.
    expect(fraction).toBeLessThan(1)
  })

  it('all steps done -> fraction exactly 1', () => {
    const { fraction, segments } = computeProgress({
      mode: 'audio',
      completedSteps: ['save_recording', 'transcribe', 'generate_estimate'],
      activeStep: null,
      activeStepElapsedMs: 0,
    })
    expect(fraction).toBe(1)
    for (const seg of segments) {
      expect(seg.state).toBe('done')
      expect(seg.fill).toBe(1)
    }
  })

  it('text mode has exactly 2 segments (save_recording -> generate_estimate)', () => {
    const { segments } = computeProgress({
      mode: 'text',
      completedSteps: [],
      activeStep: null,
      activeStepElapsedMs: 0,
    })
    expect(segments.map((s) => s.step)).toEqual(['save_recording', 'generate_estimate'])
    // Equal shares: one done segment in text mode is exactly half the bar.
    const { fraction } = computeProgress({
      mode: 'text',
      completedSteps: ['save_recording'],
      activeStep: null,
      activeStepElapsedMs: 0,
    })
    expect(fraction).toBe(0.5)
  })

  it('photos mode includes analyze (save_recording -> analyze -> generate_estimate)', () => {
    const { segments } = computeProgress({
      mode: 'photos',
      completedSteps: [],
      activeStep: 'analyze',
      activeStepElapsedMs: FALLBACK_MEDIANS_MS.analyze / 2,
    })
    expect(segments.map((s) => s.step)).toEqual(['save_recording', 'analyze', 'generate_estimate'])
    const active = segments.find((s) => s.step === 'analyze')!
    expect(active.state).toBe('active')
    expect(active.fill).toBeCloseTo(0.5, 10)
  })

  it('medians override is respected over the static fallbacks', () => {
    const { segments } = computeProgress({
      mode: 'audio',
      completedSteps: [],
      activeStep: 'transcribe',
      activeStepElapsedMs: 5_000,
      medians: { transcribe: 20_000 }, // live median says 20s, not the 8s fallback
    })
    const active = segments.find((s) => s.step === 'transcribe')!
    expect(active.fill).toBeCloseTo(0.25, 10) // 5s / 20s — NOT 5s / 8s
  })

  it('a missing/invalid median falls back safely (no NaN/Infinity fill)', () => {
    const { segments } = computeProgress({
      mode: 'audio',
      completedSteps: [],
      activeStep: 'transcribe',
      activeStepElapsedMs: 4_000,
      medians: { transcribe: 0 }, // degenerate live value must not divide by zero
    })
    const active = segments.find((s) => s.step === 'transcribe')!
    expect(Number.isFinite(active.fill)).toBe(true)
    expect(active.fill).toBeGreaterThanOrEqual(0)
    expect(active.fill).toBeLessThanOrEqual(ACTIVE_FILL_CAP)
  })

  it('steps outside the mode sequence are ignored (defensive: preview_redirect)', () => {
    const { segments, fraction } = computeProgress({
      mode: 'text',
      completedSteps: ['save_recording', 'preview_redirect'],
      activeStep: 'preview_redirect',
      activeStepElapsedMs: 1_000,
    })
    expect(segments.map((s) => s.step)).toEqual(['save_recording', 'generate_estimate'])
    expect(fraction).toBe(0.5) // only the real sequence member counts
  })

  it('negative elapsed (client/server clock skew) clamps to 0 fill', () => {
    const { segments } = computeProgress({
      mode: 'audio',
      completedSteps: [],
      activeStep: 'save_recording',
      activeStepElapsedMs: -3_000,
    })
    const active = segments.find((s) => s.step === 'save_recording')!
    expect(active.fill).toBe(0)
  })

  it('every STEP_SEQUENCES member has a FALLBACK_MEDIANS_MS entry', () => {
    for (const steps of Object.values(STEP_SEQUENCES)) {
      for (const step of steps) {
        expect(FALLBACK_MEDIANS_MS[step]).toBeGreaterThan(0)
      }
    }
  })
})
