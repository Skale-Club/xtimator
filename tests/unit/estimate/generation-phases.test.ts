import { describe, it, expect } from 'vitest'
import {
  FIRST_PASS_PHASES,
  GENERATE_PHASES,
  GENERATE_PHASE_INDEX,
  GENERATE_OVERDUE_FLOOR_MS,
  buildPhaseVisits,
  isGenerateOverdue,
  isGeneratePhase,
  phaseMedianKey,
} from '@/lib/estimate/generation-phases'

/**
 * 260806 / 260927: the generate step's sub-phase vocabulary and the journal
 * reconstruction the checklist is built from.
 */

describe('phase order', () => {
  it('declares the phases in the order the graph really runs them', () => {
    // generate node (context → drafting → pricing → saving), then assess
    // (reviewing), then the optional auto-refine pass.
    expect(GENERATE_PHASES).toEqual([
      'context',
      'drafting',
      'pricing',
      'saving',
      'reviewing',
      'refining',
    ])
    expect(FIRST_PASS_PHASES).toEqual(GENERATE_PHASES.slice(0, 5))
  })

  it('indexes every declared phase in order', () => {
    GENERATE_PHASES.forEach((phase, i) => expect(GENERATE_PHASE_INDEX[phase]).toBe(i))
  })

  it('keys live phase medians under the generate step', () => {
    expect(phaseMedianKey('drafting')).toBe('generate_estimate:drafting')
  })
})

describe('buildPhaseVisits', () => {
  const row = (phase: unknown, at: string, extra: Record<string, unknown> = {}) => ({
    step: 'generate_estimate',
    status: 'started',
    created_at: at,
    metadata: { phase, ...extra },
  })

  it('collapses consecutive rows of one phase into a visit, later detail winning', () => {
    const visits = buildPhaseVisits([
      row('pricing', '2026-09-27T12:01:00Z', { candidates: 18, itemCount: 38 }),
      row('pricing', '2026-09-27T12:01:20Z', { candidates: 18, researched: 12 }),
    ])
    expect(visits).toEqual([
      {
        phase: 'pricing',
        startedAt: '2026-09-27T12:01:00Z',
        detail: { candidates: 18, itemCount: 38, researched: 12 },
      },
    ])
  })

  it('keeps a re-entered phase as a separate visit (the refine loop)', () => {
    const visits = buildPhaseVisits([
      row('drafting', '2026-09-27T12:00:10Z'),
      row('refining', '2026-09-27T12:02:00Z', { round: 1 }),
      row('drafting', '2026-09-27T12:02:02Z'),
    ])
    expect(visits.map((v) => v.phase)).toEqual(['drafting', 'refining', 'drafting'])
  })

  it('ignores rows that are not generate phase reports', () => {
    const visits = buildPhaseVisits([
      { step: 'generate_estimate', status: 'started', created_at: '2026-09-27T12:00:00Z', metadata: null },
      { step: 'transcribe', status: 'started', created_at: '2026-09-27T12:00:01Z', metadata: { phase: 'drafting' } },
      { step: 'generate_estimate', status: 'succeeded', created_at: '2026-09-27T12:00:02Z', metadata: { phase: 'saving' } },
      row('teleporting', '2026-09-27T12:00:03Z'),
    ])
    expect(visits).toEqual([])
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
