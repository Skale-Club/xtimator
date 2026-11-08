import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/lib/i18n/use-translation', () => ({ useTranslation: () => ({ t: (s: string) => s, language: 'en' }) }))

import { RefineReview } from '@/components/capture/refine-review'

const diff = {
  changed: [{ description: 'Paint walls', oldPrice: 100, newPrice: 140, oldQty: 1, newQty: 2 }],
  added: [{ description: 'Crown molding', unit_price: 25 }],
  removed: [{ description: 'Haul debris' }],
  fields: { summary: { old: 'a', new: 'Brand new summary' }, timeline: true },
}

describe('RefineReview', () => {
  it('lists changed (old to new price and quantity), added, removed and narrative fields', () => {
    render(<RefineReview diff={diff} currencyCode="USD" onApply={() => {}} onDiscard={() => {}} />)
    const changed = screen.getByTestId('refine-review-changed')
    expect(changed).toHaveTextContent('Paint walls')
    expect(changed).toHaveTextContent('$100.00')
    expect(changed).toHaveTextContent('$140.00')
    expect(changed).toHaveTextContent('1 → 2')
    expect(screen.getByTestId('refine-review-added')).toHaveTextContent('Crown molding')
    expect(screen.getByTestId('refine-review-removed')).toHaveTextContent('Haul debris')
    const fields = screen.getByTestId('refine-review-fields')
    expect(fields).toHaveTextContent('Summary, Timeline')
    expect(fields).toHaveTextContent('Brand new summary')
  })

  it('says so when nothing changes', () => {
    render(
      <RefineReview diff={{ changed: [], added: [], removed: [], fields: {} }} currencyCode="USD" onApply={() => {}} onDiscard={() => {}} />,
    )
    expect(screen.getByTestId('refine-review-empty')).toBeInTheDocument()
  })

  it('wires Apply and Discard', () => {
    const onApply = vi.fn()
    const onDiscard = vi.fn()
    render(<RefineReview diff={diff} currencyCode="USD" onApply={onApply} onDiscard={onDiscard} />)
    fireEvent.click(screen.getByTestId('refine-apply-btn'))
    fireEvent.click(screen.getByTestId('refine-discard-btn'))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })
})
