import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'

/**
 * 260927: the capture overlay as a checklist.
 *
 * The complaint that started this: a long generation showed one label at a
 * time, and each step vanished the moment the next began, so the operator
 * could never see how much was already behind them. These tests pin that
 * finished rows stay on screen, checked, with their facts; that the bar and
 * the time-left line come from the journal; and that the screen tells the
 * operator they can leave.
 *
 * t() is mocked to the repo's `__t(<key>)__` sentinel convention so every
 * user-visible string is proven to flow through translation.
 */

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
import { formatElapsed, remainingLine } from '@/components/capture/processing-narration'
import type { GeneratePhaseVisit } from '@/lib/estimate/generation-phases'

const NOW = Date.parse('2026-09-27T12:05:00Z')
const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString()

function renderGenerating(visits: GeneratePhaseVisit[], opts: { stepAgeSec?: number } = {}) {
  const stepAge = opts.stepAgeSec ?? 60
  return render(
    <CaptureProcessingOverlay
      stage="generating"
      mode="audio"
      completedSteps={['save_recording', 'transcribe']}
      activeStep="generate_estimate"
      activeStepStartedAt={ago(stepAge)}
      stepTimings={[
        { step: 'save_recording', startedAt: ago(stepAge + 12), finishedAt: ago(stepAge + 10) },
        { step: 'transcribe', startedAt: ago(stepAge + 10), finishedAt: ago(stepAge) },
        { step: 'generate_estimate', startedAt: ago(stepAge), finishedAt: null },
      ]}
      phaseVisits={visits}
    />
  )
}

const row = (id: string) => screen.getByTestId(`checklist-row-${id}`)
const label = (id: string) => within(row(id)).getByTestId('checklist-row-label').textContent

describe('formatElapsed', () => {
  it('reads as a clock rather than a raw second count', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(7_400)).toBe('0:07')
    expect(formatElapsed(60_000)).toBe('1:00')
    expect(formatElapsed(148_000)).toBe('2:28')
  })

  it('holds a stable width through the first ten minutes', () => {
    for (const seconds of [0, 9, 59, 60, 61, 599]) {
      expect(formatElapsed(seconds * 1000)).toHaveLength(4)
    }
  })

  it('rolls over to hours and never goes negative', () => {
    expect(formatElapsed(3_725_000)).toBe('1:02:05')
    expect(formatElapsed(-5_000)).toBe('0:00')
  })
})

describe('remainingLine', () => {
  it('rounds up to whole minutes so the promise errs on the early side', () => {
    expect(remainingLine(61_000, false)).toEqual({ kind: 'minutes', minutes: 2 })
    expect(remainingLine(120_000, false)).toEqual({ kind: 'minutes', minutes: 2 })
  })

  it('switches to "under a minute" and to overdue honestly', () => {
    expect(remainingLine(59_000, false)).toEqual({ kind: 'under_a_minute' })
    expect(remainingLine(500_000, true)).toEqual({ kind: 'overdue' })
  })
})

describe('CaptureProcessingOverlay: checklist (260927)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps finished steps on screen, checked, in their finished wording', () => {
    renderGenerating([
      { phase: 'context', startedAt: ago(58), detail: {} },
      { phase: 'drafting', startedAt: ago(55), detail: {} },
    ])
    expect(row('save_recording').getAttribute('data-state')).toBe('done')
    expect(label('save_recording')).toBe('__t(Recording saved)__')
    expect(label('transcribe')).toBe('__t(Audio transcribed)__')
    expect(label('generate:context')).toBe('__t(Job details read)__')
    expect(row('generate:drafting').getAttribute('data-state')).toBe('active')
    expect(label('generate:drafting')).toBe('__t(Writing the scope of work)__')
    expect(row('generate:pricing').getAttribute('data-state')).toBe('pending')
  })

  it('shows how long each finished step took and how long the active one has run', () => {
    renderGenerating([{ phase: 'drafting', startedAt: ago(40), detail: {} }])
    expect(within(row('transcribe')).getByTestId('checklist-row-duration').textContent).toBe('0:10')
    expect(within(row('generate:drafting')).getByTestId('checklist-row-duration').textContent).toBe(
      '0:40'
    )
    expect(within(row('generate:pricing')).queryByTestId('checklist-row-duration')).toBeNull()
  })

  it('shows the sections as the model writes them', () => {
    renderGenerating([
      {
        phase: 'drafting',
        startedAt: ago(40),
        detail: { sectionsDrafted: 3, itemsDrafted: 11, draftSections: ['Demo', 'Framing', 'Paint'] },
      },
    ])
    expect(within(row('generate:drafting')).getByTestId('checklist-row-detail').textContent).toBe(
      '3 __t(sections so far)__: Demo, Framing, Paint'
    )
  })

  it('keeps the real counts on finished rows', () => {
    renderGenerating([
      { phase: 'drafting', startedAt: ago(50), detail: {} },
      {
        phase: 'pricing',
        startedAt: ago(10),
        detail: { candidates: 18, researched: 12, itemCount: 38, sectionCount: 5 },
      },
      { phase: 'saving', startedAt: ago(2), detail: {} },
    ])
    expect(within(row('generate:drafting')).getByTestId('checklist-row-detail').textContent).toBe(
      '38 __t(items in)__ 5 __t(sections)__'
    )
    expect(within(row('generate:pricing')).getByTestId('checklist-row-detail').textContent).toBe(
      '12 __t(of)__ 18 __t(prices found)__'
    )
  })

  it('explains a second pass as its own row instead of silently replaying drafting', () => {
    renderGenerating(
      [
        { phase: 'drafting', startedAt: ago(100), detail: {} },
        { phase: 'reviewing', startedAt: ago(30), detail: {} },
        { phase: 'refining', startedAt: ago(20), detail: { round: 1 } },
        { phase: 'drafting', startedAt: ago(18), detail: {} },
      ],
      { stepAgeSec: 120 }
    )
    expect(row('generate:drafting').getAttribute('data-state')).toBe('done')
    expect(row('generate:refining').getAttribute('data-state')).toBe('active')
    expect(within(row('generate:refining')).getByTestId('checklist-row-detail').textContent).toBe(
      '__t(Pass)__ 2 · __t(Writing the scope of work)__'
    )
  })

  it('shows the time left instead of a bare count-up clock', () => {
    renderGenerating([{ phase: 'drafting', startedAt: ago(5), detail: {} }])
    expect(screen.getByTestId('capture-processing-remaining').textContent).toMatch(
      /^__t\(About\)__ \d+ __t\(min left\)__$/
    )
    expect(screen.getByTestId('capture-processing-elapsed').textContent).toBe('1:12')
  })

  it('says out loud when the run has gone long instead of just freezing', () => {
    renderGenerating([{ phase: 'pricing', startedAt: ago(30), detail: {} }], { stepAgeSec: 900 })
    expect(screen.getByTestId('capture-processing-remaining').textContent).toBe(
      '__t(Bigger job than usual, still working on it)__'
    )
  })

  it('never fills the bar while the journal has not confirmed the end', () => {
    renderGenerating([{ phase: 'reviewing', startedAt: ago(600), detail: {} }], { stepAgeSec: 900 })
    expect(parseFloat(screen.getByTestId('capture-progress-fill').style.width)).toBeLessThan(100)
  })

  it('fills the bar and checks every row once the attempt is done', () => {
    render(
      <CaptureProcessingOverlay
        stage="done"
        mode="text"
        completedSteps={['save_recording', 'generate_estimate']}
        activeStep={null}
        activeStepStartedAt={null}
      />
    )
    expect(screen.getByTestId('capture-progress-fill').style.width).toBe('100%')
    expect(
      screen.getAllByTestId(/^checklist-row-/).filter((el) => el.tagName === 'LI')
        .every((el) => el.getAttribute('data-state') === 'done')
    ).toBe(true)
    expect(screen.queryByTestId('capture-processing-leave-hint')).toBeNull()
    expect(screen.getByTestId('capture-processing-label').textContent).toBe('__t(Your estimate is ready)__')
  })

  it('reports the total time when done instead of repeating that it is ready', () => {
    render(
      <CaptureProcessingOverlay
        stage="done"
        mode="text"
        completedSteps={['save_recording', 'generate_estimate']}
        activeStep={null}
        activeStepStartedAt={null}
        stepTimings={[{ step: 'save_recording', startedAt: ago(95), finishedAt: ago(93) }]}
      />
    )
    expect(screen.getByTestId('capture-processing-remaining').textContent).toBe('__t(Finished in)__ 1:35')
    expect(screen.queryByTestId('capture-processing-elapsed')).toBeNull()
  })

  it('tells the operator they can leave, and offers to continue in the background', () => {
    const onContinue = vi.fn()
    render(
      <CaptureProcessingOverlay
        stage="generating"
        mode="text"
        completedSteps={['save_recording']}
        activeStep="generate_estimate"
        activeStepStartedAt={ago(10)}
        showLeaveHint
        onContinueInBackground={onContinue}
      />
    )
    expect(screen.getByTestId('capture-processing-leave-hint').textContent).toContain(
      'You can leave this screen'
    )
    fireEvent.click(screen.getByTestId('capture-continue-in-background'))
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('never claims leaving is safe before the capture is dispatched', () => {
    render(
      <CaptureProcessingOverlay
        stage="saving"
        mode="audio"
        completedSteps={[]}
        activeStep={null}
        activeStepStartedAt={null}
      />
    )
    expect(screen.queryByTestId('capture-processing-leave-hint')).toBeNull()
    expect(screen.queryByTestId('capture-continue-in-background')).toBeNull()
  })

  it('keeps the plain loader for callers that pass no mode', () => {
    render(<CaptureProcessingOverlay stage="saving" />)
    expect(screen.getByTestId('capture-processing-label').textContent).toBe('__t(Saving)__')
    expect(screen.queryByTestId('capture-progress-checklist')).toBeNull()
  })
})
