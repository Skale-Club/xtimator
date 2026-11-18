import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OwnerReviewSummary } from '@/components/workspace/estimate/owner-review-summary'
import type { OwnerEstimateReview } from '@/lib/estimate/owner-review'

const { translate } = vi.hoisted(() => ({ translate: vi.fn((text: string) => text) }))
vi.mock('@/lib/i18n/use-translation', () => ({ useTranslation: () => ({ t: translate }) }))

const REVIEW: OwnerEstimateReview = {
  questions: ['Should the steps be painted?'],
  assumptions: ['Owner provides paint.'],
  needsReview: true,
  lowConfidenceLines: 2,
  unpricedLines: 1,
}

describe('OwnerReviewSummary', () => {
  it('does not render a disclosure when no review is available', () => {
    const { container } = render(<OwnerReviewSummary review={null} />)
    expect(container.childElementCount).toBe(0)
  })

  it('presents generation context and saved-line flags in a collapsed native disclosure', () => {
    const { container } = render(<OwnerReviewSummary review={REVIEW} />)
    const summary = screen.getByText('Review before sending')
    const details = container.querySelector('details')

    expect(details?.open).toBe(false)
    expect(summary).toBe(details?.querySelector('summary'))
    expect(screen.getByText('Questions, assumptions, and confidence flags come from the generated draft.')).toBeTruthy()
    expect(screen.getByText('Low-confidence items').textContent).toContain('2')
    expect(screen.getByText('Items without a price').textContent).toContain('1')
    expect(screen.getByText('Should the steps be painted?')).toBeTruthy()
    expect(screen.getByText('Owner provides paint.')).toBeTruthy()
    expect(screen.queryByText('Edit with AI')).toBeNull()
  })

  it('renders generated text literally without submitting it for translation', () => {
    const question = '<img src=x onerror="alert(1)">'
    const { container } = render(<OwnerReviewSummary review={{ ...REVIEW, questions: [question] }} />)

    expect(screen.getByText(question)).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
    expect(translate).not.toHaveBeenCalledWith(question)
  })

  it('opens the existing Edit with AI flow when a review action is available', () => {
    const onReview = vi.fn()
    const { container } = render(<OwnerReviewSummary review={REVIEW} onReview={onReview} />)
    container.querySelector('details')!.open = true

    fireEvent.click(screen.getByRole('button', { name: 'Edit with AI' }))

    expect(onReview).toHaveBeenCalledOnce()
  })
})
