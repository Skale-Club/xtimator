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

  it('renders one list with a marker per kind, and a struck-through removed row', () => {
    render(<RefineReview diff={diff} currencyCode="USD" onApply={() => {}} onDiscard={() => {}} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByTestId('refine-review-changed')).toHaveTextContent('→')
    expect(screen.getByTestId('refine-review-added')).toHaveTextContent('+')
    expect(screen.getByTestId('refine-review-removed')).toHaveTextContent('−')
    expect(screen.getByText('Haul debris').className).toContain('line-through')
  })

  it('only shows Price/Quantity in the changed row when they differ', () => {
    render(
      <RefineReview
        diff={{ changed: [{ description: 'Trim', oldPrice: 10, newPrice: 10, oldQty: 1, newQty: 2 }], added: [], removed: [], fields: {} }}
        currencyCode="USD"
        onApply={() => {}}
        onDiscard={() => {}}
      />,
    )
    const changed = screen.getByTestId('refine-review-changed')
    expect(changed).toHaveTextContent('Quantity: 1 → 2')
    expect(changed).not.toHaveTextContent('Price')
  })

  it('shows the before/after card with the signed difference when totals are given', () => {
    render(
      <RefineReview
        diff={diff}
        currencyCode="USD"
        totals={{ before: 2340, after: 2635, label: 'subtotal' }}
        onApply={() => {}}
        onDiscard={() => {}}
      />,
    )
    const card = screen.getByTestId('refine-review-totals')
    expect(card).toHaveTextContent('Subtotal')
    expect(card).toHaveTextContent('$2,340.00')
    expect(card).toHaveTextContent('$2,635.00')
    expect(card).toHaveTextContent('+$295.00')
  })

  it('labels a drop with a minus and omits the card without totals', () => {
    const { rerender } = render(
      <RefineReview
        diff={diff}
        currencyCode="USD"
        totals={{ before: 100, after: 60, label: 'total' }}
        onApply={() => {}}
        onDiscard={() => {}}
      />,
    )
    expect(screen.getByTestId('refine-review-totals')).toHaveTextContent('−$40.00')
    rerender(<RefineReview diff={diff} currencyCode="USD" onApply={() => {}} onDiscard={() => {}} />)
    expect(screen.queryByTestId('refine-review-totals')).toBeNull()
  })

  it('disables both buttons while applying', () => {
    render(<RefineReview diff={diff} currencyCode="USD" applying onApply={() => {}} onDiscard={() => {}} />)
    expect(screen.getByTestId('refine-apply-btn')).toBeDisabled()
    expect(screen.getByTestId('refine-discard-btn')).toBeDisabled()
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
