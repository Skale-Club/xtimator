import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * Notices review stage 1 (2026-11-20): the AI's open questions as answer cards
 * in "Edit with AI", replacing the "Review before sending" box and its
 * "Q:/A:" text dumped into the instruction box.
 */

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

import { RefineQuestions, answeredCount, composeRefineInstruction } from '@/components/capture/refine-questions'

const QUESTIONS = ['Residential or commercial?', 'Stairs, pets or heavy stains?']

function setup(over: Partial<React.ComponentProps<typeof RefineQuestions>> = {}) {
  const props = {
    questions: QUESTIONS,
    assumptions: ['3 rooms and a hall', 'No furniture moving'],
    answers: {} as Record<string, string>,
    onAnswer: vi.fn(),
    voiceFor: [] as string[],
    onVoice: vi.fn(),
    skipped: [] as string[],
    onSkip: vi.fn(),
    ...over,
  }
  render(<RefineQuestions {...props} />)
  return props
}

describe('composeRefineInstruction', () => {
  it('sends only the answered questions, then the other changes', () => {
    const text = composeRefineInstruction({
      questions: QUESTIONS,
      answers: { [QUESTIONS[0]]: 'Residential' },
      voiceFor: [QUESTIONS[1]],
      extra: 'Use $0.35/sq ft',
    })
    expect(text).toBe(
      'Answers to your open questions:\n' +
        '1. Q: Residential or commercial?\n   A: Residential\n' +
        '2. Q: Stairs, pets or heavy stains?\n   A: (answered in the voice note)\n\n' +
        'Other changes:\nUse $0.35/sq ft',
    )
  })

  it('with no answers it is just what the owner typed', () => {
    expect(composeRefineInstruction({ questions: QUESTIONS, answers: { [QUESTIONS[0]]: '  ' }, voiceFor: [], extra: ' fix it ' })).toBe('fix it')
  })

  it('counts typed and voice answers once each', () => {
    expect(answeredCount(QUESTIONS, { [QUESTIONS[0]]: 'x' }, [QUESTIONS[0], QUESTIONS[1]])).toBe(2)
    expect(answeredCount(QUESTIONS, {}, [])).toBe(0)
  })
})

describe('RefineQuestions', () => {
  it('opens the first unanswered question with a field, a mic and Skip', () => {
    const p = setup()
    const cards = screen.getAllByTestId('refine-question')
    expect(cards).toHaveLength(2)
    expect(screen.getByTestId('refine-questions-progress').textContent).toBe('0 of 2 answered')
    fireEvent.change(screen.getByTestId('refine-question-input'), { target: { value: 'Residential' } })
    expect(p.onAnswer).toHaveBeenCalledWith(QUESTIONS[0], 'Residential')
    fireEvent.click(screen.getByTestId('refine-question-mic'))
    expect(p.onVoice).toHaveBeenCalledWith(QUESTIONS[0])
  })

  it('an answered card collapses with its answer; the next one opens', () => {
    setup({ answers: { [QUESTIONS[0]]: 'Residential' } })
    const [first, second] = screen.getAllByTestId('refine-question')
    expect(first.getAttribute('data-state')).toBe('answered')
    expect(first.textContent).toContain('Residential')
    expect(second.querySelector('[data-testid="refine-question-input"]')).toBeTruthy()
    expect(screen.getByTestId('refine-questions-progress').textContent).toBe('1 of 2 answered')
  })

  it('Skip reports the question and moves on; nothing is required', () => {
    const p = setup()
    fireEvent.click(screen.getByTestId('refine-question-skip'))
    expect(p.onSkip).toHaveBeenCalledWith(QUESTIONS[0])
  })

  // Owner rule 2026-11-20: every question is optional, one tap sets them all aside.
  it('Skip all skips every open question, and is gone once none is open', () => {
    const p = setup({ answers: { [QUESTIONS[0]]: 'Residential' } })
    fireEvent.click(screen.getByTestId('refine-questions-skip-all'))
    expect(p.onSkip).toHaveBeenCalledTimes(1)
    expect(p.onSkip).toHaveBeenCalledWith(QUESTIONS[1])
  })

  it('no Skip all when every question is answered or skipped', () => {
    setup({ answers: { [QUESTIONS[0]]: 'x' }, skipped: [QUESTIONS[1]] })
    expect(screen.queryByTestId('refine-questions-skip-all')).toBeNull()
  })

  it('no answer field is ever required', () => {
    setup()
    for (const input of screen.getAllByTestId('refine-question-input')) {
      expect(input.hasAttribute('required')).toBe(false)
    }
  })

  it('the per-question mic is off while a recording runs', () => {
    setup({ recording: true })
    expect((screen.getByTestId('refine-question-mic') as HTMLButtonElement).disabled).toBe(true)
  })

  it('assumptions start collapsed', () => {
    setup()
    expect(screen.queryByTestId('refine-assumptions')).toBeNull()
    fireEvent.click(screen.getByTestId('refine-assumptions-toggle'))
    expect(screen.getByTestId('refine-assumptions').textContent).toContain('3 rooms and a hall')
  })

  it('renders nothing with no questions and no assumptions', () => {
    setup({ questions: [], assumptions: [] })
    expect(screen.queryByTestId('refine-questions')).toBeNull()
  })
})
