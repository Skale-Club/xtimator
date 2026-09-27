import { describe, it, expect } from 'vitest'

/**
 * 260927: buildChecklist, the pure model behind the capture checklist.
 *
 * Honesty invariants under test:
 *   - a row is `done` only when the journal proves it (its step succeeded, or a
 *     later phase/step started);
 *   - the active row never fills its share of the bar, however long it runs;
 *   - finished rows keep the facts the server reported for them;
 *   - the bar is weighted by real duration, not split into equal thirds.
 */
import {
  ACTIVE_FILL_CAP,
  FALLBACK_MEDIANS_MS,
  STEP_SEQUENCES,
  buildChecklist,
  type ChecklistInput,
} from '@/lib/estimate/progress-model'
import { GENERATE_PHASE_TYPICAL_MS, type GeneratePhaseVisit } from '@/lib/estimate/generation-phases'

const T0 = Date.parse('2026-09-27T12:00:00Z')
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString()

function input(overrides: Partial<ChecklistInput> = {}): ChecklistInput {
  return {
    mode: 'audio',
    done: false,
    completedSteps: [],
    activeStep: null,
    activeStepStartedAt: null,
    nowMs: T0,
    ...overrides,
  }
}

function visit(phase: GeneratePhaseVisit['phase'], sec: number, detail = {}): GeneratePhaseVisit {
  return { phase, startedAt: at(sec), detail }
}

/** An audio attempt that reached generation at t=10s. */
function generating(visits: GeneratePhaseVisit[], nowSec: number): ChecklistInput {
  return input({
    completedSteps: ['save_recording', 'transcribe'],
    activeStep: 'generate_estimate',
    activeStepStartedAt: at(10),
    stepTimings: [
      { step: 'save_recording', startedAt: at(0), finishedAt: at(2) },
      { step: 'transcribe', startedAt: at(2), finishedAt: at(10) },
      { step: 'generate_estimate', startedAt: at(10), finishedAt: null },
    ],
    phaseVisits: visits,
    nowMs: T0 + nowSec * 1000,
  })
}

const states = (snap: ReturnType<typeof buildChecklist>) =>
  Object.fromEntries(snap.rows.map((r) => [r.id, r.state]))

describe('buildChecklist: rows per mode', () => {
  it('lists every pipeline step and every first-pass generate phase, in execution order', () => {
    const snap = buildChecklist(input())
    expect(snap.rows.map((r) => r.id)).toEqual([
      'save_recording',
      'transcribe',
      'generate:context',
      'generate:drafting',
      'generate:pricing',
      'generate:saving',
      'generate:reviewing',
    ])
  })

  it('photos mode analyzes instead of transcribing; text mode does neither', () => {
    expect(buildChecklist(input({ mode: 'photos' })).rows.map((r) => r.id)).toContain('analyze')
    const text = buildChecklist(input({ mode: 'text' })).rows.map((r) => r.id)
    expect(text).not.toContain('transcribe')
    expect(text).not.toContain('analyze')
  })

  it('keeps STEP_SEQUENCES as the source of the pre-generation rows', () => {
    for (const mode of ['audio', 'photos', 'text'] as const) {
      const ids = buildChecklist(input({ mode })).rows.map((r) => r.id)
      const pre = STEP_SEQUENCES[mode].filter((s) => s !== 'generate_estimate')
      expect(ids.slice(0, pre.length)).toEqual(pre)
    }
  })
})

describe('buildChecklist: states come from the journal', () => {
  it('marks the first row active before any journal row, so the screen never looks frozen', () => {
    const snap = buildChecklist(input())
    expect(snap.rows[0].state).toBe('active')
    expect(snap.rows.slice(1).every((r) => r.state === 'pending')).toBe(true)
    expect(snap.fraction).toBe(0)
  })

  it('checks off finished steps and keeps their real duration', () => {
    const snap = buildChecklist(generating([visit('context', 11)], 12))
    const save = snap.rows.find((r) => r.id === 'save_recording')!
    const transcribe = snap.rows.find((r) => r.id === 'transcribe')!
    expect(save).toMatchObject({ state: 'done', durationMs: 2_000 })
    expect(transcribe).toMatchObject({ state: 'done', durationMs: 8_000 })
  })

  it('treats context as active when generation started but no phase is reported yet', () => {
    const snap = buildChecklist(generating([], 11))
    expect(states(snap)['generate:context']).toBe('active')
  })

  it('completes a phase the moment the next one is reported', () => {
    const snap = buildChecklist(
      generating([visit('context', 11), visit('drafting', 13), visit('pricing', 90)], 100)
    )
    expect(states(snap)).toMatchObject({
      'generate:context': 'done',
      'generate:drafting': 'done',
      'generate:pricing': 'active',
      'generate:saving': 'pending',
      'generate:reviewing': 'pending',
    })
    expect(snap.rows.find((r) => r.id === 'generate:drafting')!.durationMs).toBe(77_000)
    expect(snap.rows.find((r) => r.id === 'generate:pricing')!.durationMs).toBe(10_000)
  })

  it('back-fills rows the journal skipped: the pipeline is strictly ordered', () => {
    // An older server build that never reported `context`.
    const snap = buildChecklist(generating([visit('drafting', 13)], 20))
    expect(states(snap)['generate:context']).toBe('done')
    expect(states(snap)['generate:drafting']).toBe('active')
  })

  it('marks everything done once the attempt is confirmed complete', () => {
    const snap = buildChecklist({ ...generating([visit('saving', 150)], 160), done: true })
    expect(snap.rows.every((r) => r.state === 'done')).toBe(true)
    expect(snap.fraction).toBe(1)
    expect(snap.remainingMs).toBe(0)
  })

  it('shows the next row as active in the gap between two steps, with no clock of its own', () => {
    const snap = buildChecklist(
      input({
        completedSteps: ['save_recording', 'transcribe'],
        activeStep: null,
        stepTimings: [
          { step: 'save_recording', startedAt: at(0), finishedAt: at(2) },
          { step: 'transcribe', startedAt: at(2), finishedAt: at(10) },
        ],
        nowMs: T0 + 11_000,
      })
    )
    const context = snap.rows.find((r) => r.id === 'generate:context')!
    expect(context.state).toBe('active')
    expect(context.durationMs).toBeNull()
  })
})

describe('buildChecklist: the auto-refine second pass', () => {
  const firstPass = [
    visit('context', 11),
    visit('drafting', 13),
    visit('pricing', 90),
    visit('saving', 110),
    visit('reviewing', 114),
  ]

  it('adds a second-pass row only once the journal reports refining', () => {
    expect(buildChecklist(generating(firstPass, 116)).rows.map((r) => r.id)).not.toContain(
      'generate:refining'
    )
    const snap = buildChecklist(
      generating([...firstPass, visit('refining', 117, { round: 1 }), visit('drafting', 118)], 130)
    )
    const refine = snap.rows.find((r) => r.id === 'generate:refining')!
    expect(refine.state).toBe('active')
    // Pass 2, currently re-drafting: the row says where the second pass is.
    expect(refine.detail).toEqual({ kind: 'second_pass', round: 1, phase: 'drafting' })
    expect(refine.durationMs).toBe(13_000)
  })

  it('keeps every first-pass row checked while the second pass re-runs them', () => {
    const snap = buildChecklist(
      generating([...firstPass, visit('refining', 117, { round: 1 }), visit('context', 118)], 130)
    )
    for (const id of [
      'generate:context',
      'generate:drafting',
      'generate:pricing',
      'generate:saving',
      'generate:reviewing',
    ]) {
      expect(states(snap)[id]).toBe('done')
    }
    expect(snap.rows.find((r) => r.id === 'generate:reviewing')!.durationMs).toBe(3_000)
  })
})

describe('buildChecklist: facts on the rows', () => {
  it('shows the sections as the model writes them', () => {
    const snap = buildChecklist(
      generating(
        [
          visit('context', 11),
          visit('drafting', 13, {
            sectionsDrafted: 4,
            itemsDrafted: 17,
            draftSections: ['Demo', 'Framing', 'Electrical', 'Paint'],
          }),
        ],
        60
      )
    )
    expect(snap.rows.find((r) => r.id === 'generate:drafting')!.detail).toEqual({
      kind: 'drafting_live',
      sections: 4,
      items: 17,
      titles: ['Framing', 'Electrical', 'Paint'],
    })
  })

  it('keeps the draft size on the finished drafting row', () => {
    const snap = buildChecklist(
      generating(
        [
          visit('drafting', 13),
          visit('pricing', 90, { candidates: 18, itemCount: 38, sectionCount: 5 }),
        ],
        95
      )
    )
    expect(snap.rows.find((r) => r.id === 'generate:drafting')!.detail).toEqual({
      kind: 'drafted',
      items: 38,
      sections: 5,
    })
    expect(snap.rows.find((r) => r.id === 'generate:pricing')!.detail).toEqual({
      kind: 'to_price',
      candidates: 18,
    })
  })

  it('reports the researched count once pricing comes back', () => {
    const snap = buildChecklist(
      generating([visit('pricing', 90, { candidates: 18, researched: 12 }), visit('saving', 110)], 111)
    )
    expect(snap.rows.find((r) => r.id === 'generate:pricing')!.detail).toEqual({
      kind: 'priced',
      researched: 12,
      candidates: 18,
    })
  })

  it('says every price came from the price book instead of printing "0 of 0"', () => {
    const snap = buildChecklist(generating([visit('pricing', 90, { candidates: 0, itemCount: 12 })], 91))
    expect(snap.rows.find((r) => r.id === 'generate:pricing')!.detail).toEqual({
      kind: 'price_book',
      items: 12,
    })
  })

  it('carries photo coverage on the analyze row', () => {
    const snap = buildChecklist(
      input({
        mode: 'photos',
        completedSteps: ['save_recording', 'analyze'],
        analyzedCount: 4,
        totalCount: 5,
        failedCount: 1,
      })
    )
    expect(snap.rows.find((r) => r.id === 'analyze')!.detail).toEqual({
      kind: 'photos',
      analyzed: 4,
      total: 5,
      failed: 1,
    })
  })
})

describe('buildChecklist: the bar and the time left', () => {
  it('weights rows by real duration: two quick steps are a sliver, not two thirds', () => {
    const snap = buildChecklist(generating([visit('context', 11)], 11))
    // save_recording + transcribe are done, yet generation still dominates.
    expect(snap.fraction).toBeLessThan(0.15)
  })

  it('never fills the active row, however long it runs', () => {
    const drafting = GENERATE_PHASE_TYPICAL_MS.drafting
    const early = buildChecklist(generating([visit('drafting', 13)], 13 + 1))
    const late = buildChecklist(generating([visit('drafting', 13)], 13 + (drafting * 20) / 1000))
    expect(late.fraction).toBeGreaterThan(early.fraction)
    // The next row's journal report is what completes it, never the clock.
    const pricingFloor = buildChecklist(generating([visit('drafting', 13), visit('pricing', 90)], 90))
    expect(late.fraction).toBeLessThan(pricingFloor.fraction)
    expect(late.fraction).toBeLessThanOrEqual(ACTIVE_FILL_CAP)
  })

  it('keeps moving while a row runs long instead of freezing at a cap', () => {
    const drafting = GENERATE_PHASE_TYPICAL_MS.drafting
    const a = buildChecklist(generating([visit('drafting', 13)], 13 + (drafting * 1.5) / 1000))
    const b = buildChecklist(generating([visit('drafting', 13)], 13 + (drafting * 2) / 1000))
    expect(b.fraction).toBeGreaterThan(a.fraction)
  })

  it('estimates the time left from the typical durations of what is still ahead', () => {
    const snap = buildChecklist(generating([visit('context', 11)], 11))
    const ahead =
      GENERATE_PHASE_TYPICAL_MS.context +
      GENERATE_PHASE_TYPICAL_MS.drafting +
      GENERATE_PHASE_TYPICAL_MS.pricing +
      GENERATE_PHASE_TYPICAL_MS.saving +
      GENERATE_PHASE_TYPICAL_MS.reviewing
    expect(snap.remainingMs).toBe(ahead)
  })

  it('prefers live medians over the fallbacks, per step and per phase', () => {
    const snap = buildChecklist({
      ...generating([visit('drafting', 13)], 13),
      medians: { 'generate_estimate:drafting': 40_000, transcribe: 5_000 },
    })
    expect(snap.rows.find((r) => r.id === 'generate:drafting')!.typicalMs).toBe(40_000)
    expect(snap.rows.find((r) => r.id === 'transcribe')!.typicalMs).toBe(5_000)
    expect(snap.rows.find((r) => r.id === 'save_recording')!.typicalMs).toBe(
      FALLBACK_MEDIANS_MS.save_recording
    )
  })

  it('ignores invalid medians instead of producing NaN', () => {
    const snap = buildChecklist({
      ...generating([visit('drafting', 13)], 30),
      medians: { 'generate_estimate:drafting': Number.NaN, transcribe: -1 },
    })
    expect(Number.isFinite(snap.fraction)).toBe(true)
    expect(Number.isFinite(snap.remainingMs)).toBe(true)
  })

  it('never claims zero time left for a row that is still running', () => {
    const snap = buildChecklist(generating([visit('reviewing', 114)], 1_000))
    expect(snap.remainingMs).toBeGreaterThan(0)
  })

  it('measures the elapsed clock from the first journal row', () => {
    expect(buildChecklist(generating([], 95)).elapsedMs).toBe(95_000)
  })

  it('flags an overdue generation only after a generous threshold', () => {
    expect(buildChecklist(generating([visit('drafting', 13)], 100)).overdue).toBe(false)
    expect(buildChecklist(generating([visit('drafting', 13)], 1_000)).overdue).toBe(true)
  })

  it('clamps a skewed clock (now before the journal) to zero instead of going negative', () => {
    const snap = buildChecklist(generating([visit('drafting', 13)], 0))
    expect(snap.rows.find((r) => r.id === 'generate:drafting')!.durationMs).toBe(0)
    expect(snap.elapsedMs).toBe(0)
  })
})

describe('buildChecklist: the bar never walks backwards', () => {
  it('resumes from where it stood when the second pass appears, then keeps creeping', () => {
    const firstPass = [
      visit('context', 11),
      visit('drafting', 13),
      visit('pricing', 90),
      visit('saving', 110),
      visit('reviewing', 114),
    ]
    const justBefore = buildChecklist(generating(firstPass, 117)).fraction
    const withRefine = [...firstPass, visit('refining', 117, { round: 1 })]
    const atRefine = buildChecklist(generating(withRefine, 117)).fraction
    const later = buildChecklist(generating([...withRefine, visit('drafting', 118)], 180)).fraction
    expect(atRefine).toBeCloseTo(justBefore, 10)
    expect(later).toBeGreaterThan(atRefine)
    expect(later).toBeLessThan(1)
  })
})
