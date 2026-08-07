import { describe, it, expect } from 'vitest'
import {
  GENERATE_PHASES,
  GENERATE_PHASE_BOUNDS,
  GENERATE_PHASE_INDEX,
  GENERATE_OVERDUE_FLOOR_MS,
  generatePhaseFill,
  isGenerateOverdue,
  isGeneratePhase,
} from '@/lib/estimate/generation-phases'
import { ACTIVE_FILL_CAP, computeProgress } from '@/lib/estimate/progress-model'

/**
 * 260806: the generate step's sub-phase model.
 *
 * The honesty invariants here are the same ones progress-model.test.ts pins for
 * the segment bar, pushed one level down: phase-driven fill may only ever
 * reflect phases the JOURNAL reported, it may never reach the segment's
 * completion, and it may never walk backwards when the auto-refine loop
 * legitimately re-runs an earlier phase.
 */
describe('generation phase bounds', () => {
  it('covers [0, ACTIVE_FILL_CAP] contiguously in declared order', () => {
    let previousEnd = 0
    for (const phase of GENERATE_PHASES) {
      const [start, end] = GENERATE_PHASE_BOUNDS[phase]
      expect(start).toBeCloseTo(previousEnd, 6)
      expect(end).toBeGreaterThan(start)
      previousEnd = end
    }
    // The last phase stops AT the cap: the segment still waits for the
    // journal's succeeded event rather than completing itself.
    expect(previousEnd).toBeCloseTo(ACTIVE_FILL_CAP, 6)
  })

  it('indexes every declared phase in order', () => {
    GENERATE_PHASES.forEach((phase, i) => {
      expect(GENERATE_PHASE_INDEX[phase]).toBe(i)
    })
  })
})

describe('generatePhaseFill', () => {
  it('starts at the furthest phase floor with no elapsed time', () => {
    expect(
      generatePhaseFill({ phase: 'pricing', furthestPhase: 'pricing', phaseElapsedMs: 0 })
    ).toBeCloseTo(GENERATE_PHASE_BOUNDS.pricing[0], 6)
  })

  it('never reaches the phase ceiling no matter how long the phase runs', () => {
    const fill = generatePhaseFill({
      phase: 'drafting',
      furthestPhase: 'drafting',
      phaseElapsedMs: 60 * 60_000,
    })
    expect(fill).toBeLessThan(GENERATE_PHASE_BOUNDS.drafting[1])
  })

  it('never exceeds ACTIVE_FILL_CAP even in the final phase', () => {
    const fill = generatePhaseFill({
      phase: 'saving',
      furthestPhase: 'saving',
      phaseElapsedMs: 60 * 60_000,
    })
    expect(fill).toBeLessThanOrEqual(ACTIVE_FILL_CAP)
  })

  it('holds the furthest-phase floor when the refine loop re-enters an earlier phase', () => {
    // Second-pass drafting after a refine round: the live phase is `drafting`
    // again, but the furthest reached is `refining`, so the fill must stay in the
    // refining band, never drop back to drafting's.
    const fill = generatePhaseFill({
      phase: 'drafting',
      furthestPhase: 'refining',
      phaseElapsedMs: 5_000,
    })
    expect(fill).toBeGreaterThanOrEqual(GENERATE_PHASE_BOUNDS.refining[0])
    expect(fill).toBeGreaterThan(GENERATE_PHASE_BOUNDS.drafting[1])
  })

  it('advances monotonically with elapsed time inside a phase', () => {
    const early = generatePhaseFill({ phase: 'pricing', furthestPhase: 'pricing', phaseElapsedMs: 1_000 })
    const later = generatePhaseFill({ phase: 'pricing', furthestPhase: 'pricing', phaseElapsedMs: 9_000 })
    expect(later).toBeGreaterThan(early)
  })
})

describe('isGeneratePhase', () => {
  it('accepts declared phases and rejects anything else', () => {
    expect(isGeneratePhase('pricing')).toBe(true)
    expect(isGeneratePhase('teleporting')).toBe(false)
    expect(isGeneratePhase(undefined)).toBe(false)
    expect(isGeneratePhase(3)).toBe(false)
  })
})

describe('isGenerateOverdue', () => {
  it('stays quiet for a normal-length run', () => {
    expect(isGenerateOverdue({ elapsedMs: 45_000 })).toBe(false)
  })

  it('fires once the run passes the floor', () => {
    expect(isGenerateOverdue({ elapsedMs: GENERATE_OVERDUE_FLOOR_MS + 1 })).toBe(true)
  })

  it('ignores an implausibly small live median instead of crying wolf', () => {
    // The production median for this step was 0.276s while real runs took ~30s
    // (the Inngest replay t0 bug). A 30s run must not be declared slow on the
    // strength of that number.
    expect(isGenerateOverdue({ elapsedMs: 30_000, medianMs: 276 })).toBe(false)
  })

  it('scales past the floor when the median is genuinely large', () => {
    expect(isGenerateOverdue({ elapsedMs: 150_000, medianMs: 120_000 })).toBe(false)
    expect(isGenerateOverdue({ elapsedMs: 310_000, medianMs: 120_000 })).toBe(true)
  })
})

describe('computeProgress with phase telemetry', () => {
  const baseInput = {
    mode: 'audio' as const,
    completedSteps: ['save_recording', 'transcribe'],
    activeStep: 'generate_estimate',
    activeStepElapsedMs: 240_000,
  }

  it('fills the generate segment by phase instead of elapsed-vs-median', () => {
    const { segments } = computeProgress({
      ...baseInput,
      // A broken sub-second median would saturate the old elapsed/median path
      // instantly; the phase path must ignore it entirely.
      medians: { generate_estimate: 276 },
      generatePhase: { phase: 'drafting', furthestPhase: 'drafting', phaseElapsedMs: 0 },
    })
    const generate = segments.find((s) => s.step === 'generate_estimate')!
    expect(generate.state).toBe('active')
    expect(generate.fill).toBeCloseTo(GENERATE_PHASE_BOUNDS.drafting[0], 6)
  })

  it('keeps the elapsed/median behavior when no phase is reported', () => {
    const { segments } = computeProgress({
      ...baseInput,
      activeStepElapsedMs: 17_500,
      medians: { generate_estimate: 35_000 },
    })
    const generate = segments.find((s) => s.step === 'generate_estimate')!
    expect(generate.fill).toBeCloseTo(0.5, 6)
  })

  it('still caps the phase-driven segment below completion', () => {
    const { segments } = computeProgress({
      ...baseInput,
      generatePhase: { phase: 'saving', furthestPhase: 'saving', phaseElapsedMs: 10 * 60_000 },
    })
    const generate = segments.find((s) => s.step === 'generate_estimate')!
    expect(generate.fill).toBeLessThanOrEqual(ACTIVE_FILL_CAP)
    expect(generate.state).toBe('active')
  })

  it('ignores phase telemetry for a step that is not the active generate step', () => {
    const { segments } = computeProgress({
      mode: 'audio',
      completedSteps: ['save_recording'],
      activeStep: 'transcribe',
      activeStepElapsedMs: 4_000,
      medians: { transcribe: 8_000 },
      generatePhase: { phase: 'saving', furthestPhase: 'saving', phaseElapsedMs: 60_000 },
    })
    expect(segments.find((s) => s.step === 'transcribe')!.fill).toBeCloseTo(0.5, 6)
    expect(segments.find((s) => s.step === 'generate_estimate')!.fill).toBe(0)
  })
})
