import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * Notices review stage 1, part 2 (2026-11-20): a project waiting for details
 * (projects.status 'awaiting_details', HARD-06) with a blank estimate shows the
 * AI's questions as the page's main content, replacing the old alert banner.
 */

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

import { NeedsDetailsEmptyState, estimateIsBlank } from '@/components/workspace/needs-details-empty-state'

const item = (over: Record<string, unknown> = {}) => ({ description: '', unit_price: 0, ...over })
const est = (items: Record<string, unknown>[]) =>
  ({ sections: [{ items }] }) as unknown as Parameters<typeof estimateIsBlank>[0]

describe('estimateIsBlank', () => {
  it('blank with no lines, or lines with neither a description nor a price', () => {
    expect(estimateIsBlank(est([]))).toBe(true)
    expect(estimateIsBlank(est([item(), item({ description: '   ' })]))).toBe(true)
  })

  it('not blank once a line has a description or a price', () => {
    expect(estimateIsBlank(est([item({ description: 'Paint walls' })]))).toBe(false)
    expect(estimateIsBlank(est([item({ unit_price: 40 })]))).toBe(false)
  })
})

describe('NeedsDetailsEmptyState', () => {
  it('numbers the questions and answers them with one action', () => {
    const onAnswer = vi.fn()
    render(<NeedsDetailsEmptyState questions={['How many rooms?', 'Ceilings too?']} onAnswer={onAnswer} />)
    expect(screen.getByRole('heading', { name: 'Almost there' })).toBeTruthy()
    const list = screen.getByTestId('needs-details-questions')
    expect(list.querySelectorAll('li')).toHaveLength(2)
    expect(list.textContent).toContain('1How many rooms?')
    fireEvent.click(screen.getByRole('button', { name: 'Answer and generate' }))
    expect(onAnswer).toHaveBeenCalledTimes(1)
  })

  it('a mic test asks to record again, with no question list', () => {
    render(<NeedsDetailsEmptyState reason="mic_test" questions={['ignored']} onAnswer={() => {}} />)
    expect(screen.getByText(/mic test/)).toBeTruthy()
    expect(screen.queryByTestId('needs-details-questions')).toBeNull()
    expect(screen.getByRole('button', { name: 'Record again' })).toBeTruthy()
  })

  it('no questions: the generic copy', () => {
    render(<NeedsDetailsEmptyState onAnswer={() => {}} />)
    expect(screen.getByRole('heading', { name: 'We need a bit more detail' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add details and generate' })).toBeTruthy()
  })

  it('"Fill it in myself" only when offered', () => {
    const onFillMyself = vi.fn()
    render(<NeedsDetailsEmptyState questions={['Q?']} onAnswer={() => {}} onFillMyself={onFillMyself} />)
    fireEvent.click(screen.getByTestId('needs-details-fill-myself'))
    expect(onFillMyself).toHaveBeenCalledTimes(1)
  })
})
