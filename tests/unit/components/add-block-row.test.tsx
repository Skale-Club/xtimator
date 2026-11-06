import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AddBlockRow, addableBlocks } from '@/components/workspace/estimate/add-block-row'
import { initialPresentationSettings } from '@/lib/estimate/document-blocks'

// SEED-056 Phase D: the "+ Add block" row offers a chip for every hidden block
// and nothing else.

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

beforeEach(() => cleanup())

const bareBlank = initialPresentationSettings(null, {
  hasPaymentText: false,
  hasWarrantyText: false,
  hasEstimateTerms: false,
  isAiEstimate: false,
})

describe('addableBlocks', () => {
  it('a blank estimate for a bare company can add everything but photos / fine print / valid-until (not offered)', () => {
    expect(addableBlocks(bareBlank, { hasCompanyTerms: false, hasValidUntil: false })).toEqual([
      'summary',
      'payment_terms',
      'warranty_terms',
      'timeline',
      'notes',
    ])
  })

  it('offers the fine print only when the company has it, valid-until only when the estimate has a date', () => {
    expect(addableBlocks(bareBlank, { hasCompanyTerms: true, hasValidUntil: true })).toEqual([
      'summary',
      'payment_terms',
      'warranty_terms',
      'timeline',
      'notes',
      'estimate_terms',
      'valid_until',
    ])
  })

  it('a legacy estimate (NULL settings, everything visible) has nothing to add except a valid-until date', () => {
    expect(addableBlocks(null, { hasCompanyTerms: true, hasValidUntil: false })).toEqual([])
    expect(addableBlocks(null, { hasCompanyTerms: true, hasValidUntil: true })).toEqual(['valid_until'])
  })

  it('a block that is already shown is not offered', () => {
    const settings = { sections: { ...bareBlank.sections, timeline: true } }
    expect(addableBlocks(settings, { hasCompanyTerms: false, hasValidUntil: false })).not.toContain('timeline')
  })

  it('photos is offered once switched off', () => {
    const settings = { sections: { ...bareBlank.sections, photos: false } }
    expect(addableBlocks(settings, { hasCompanyTerms: false, hasValidUntil: false })).toContain('photos')
  })
})

describe('AddBlockRow', () => {
  it('renders one chip per hidden block and reports the clicked key', () => {
    const onAdd = vi.fn()
    render(<AddBlockRow settings={bareBlank} hasCompanyTerms={false} hasValidUntil={false} onAdd={onAdd} />)
    expect(screen.getByTestId('add-block-row')).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(5)
    fireEvent.click(screen.getByTestId('add-block-timeline'))
    expect(onAdd).toHaveBeenCalledWith('timeline')
  })

  it('renders nothing when no block is hidden', () => {
    const { container } = render(
      <AddBlockRow settings={null} hasCompanyTerms={false} hasValidUntil={false} onAdd={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('the chip goes away once the block is on', () => {
    const settings = { sections: { ...bareBlank.sections, payment_terms: true } }
    render(<AddBlockRow settings={settings} hasCompanyTerms={false} hasValidUntil={false} onAdd={vi.fn()} />)
    expect(screen.queryByTestId('add-block-payment_terms')).toBeNull()
    expect(screen.getByTestId('add-block-notes')).toBeTruthy()
  })
})
