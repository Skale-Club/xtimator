// tests/unit/estimate/paginated-preview-editing.test.tsx
//
// In-place editing on PaginatedPreview's sheets (preview-template/editable.tsx):
// with `dispatch` the values become click-to-edit fields that dispatch ONCE on
// commit (never per keystroke — a dispatch can re-paginate and remount the
// field); without it nothing is focusable/editable. Hand-built pages, like
// paginated-preview.test.tsx, so the asserted blocks are always on the sheet.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react'
import React from 'react'
import { PaginatedPreview, type PaginatedPreviewProps } from '@/components/workspace/estimate/paginated-preview'
import { parseLooseNumber } from '@/components/workspace/estimate/preview-template/editable'
import type { DocumentCompany, EstimateDocumentData } from '@/lib/estimate/document/model'
import type { PageAssignment } from '@/lib/estimate/pagination/types'
import {
  buildFixtureEstimate,
  toFixtureDocumentData,
  FIXTURE_COMPANY,
  PHOTO_WITH_CAPTION,
} from './fixtures/document-fixtures'

const company = FIXTURE_COMPANY as unknown as DocumentCompany
const SECTION_ID = 'sec-1'

afterEach(cleanup)

function buildFixture() {
  const items = [0, 1].map((i) => ({
    id: `item-${i}`,
    description: `Line item ${i}`,
    quantity: 2,
    unit: 'ea',
    unit_price: 100,
    total: 200,
    sort_order: i + 1,
  }))
  const estimate = buildFixtureEstimate({
    sections: [
      {
        id: SECTION_ID,
        estimate_id: 'fixture-est-1',
        company_id: 'fixture-co-1',
        title: 'Demolition',
        sort_order: 1,
        subtotal: 400,
        items,
      },
    ],
  })
  const data = {
    ...(toFixtureDocumentData(estimate) as unknown as EstimateDocumentData),
    attachedPhotos: [PHOTO_WITH_CAPTION],
  } as EstimateDocumentData
  const pages: PageAssignment[] = [
    {
      pageIndex: 0,
      continuesTable: false,
      blocks: [
        { kind: 'info-grid', id: 'info', baseHeightPt: 60, atomic: true, page1Only: true },
        { kind: 'summary', id: 'summary', baseHeightPt: 30, atomic: true, page1Only: true },
        { kind: 'section-header', id: `${SECTION_ID}-header`, baseHeightPt: 20, atomic: true, ref: { sectionId: SECTION_ID } },
        { kind: 'item-row', id: `${SECTION_ID}-rows-item-0`, baseHeightPt: 12, atomic: true, ref: { sectionId: SECTION_ID, itemId: 'item-0', itemIndex: 0 } },
        { kind: 'item-row', id: `${SECTION_ID}-rows-item-1`, baseHeightPt: 12, atomic: true, ref: { sectionId: SECTION_ID, itemId: 'item-1', itemIndex: 1 } },
        { kind: 'section-subtotal', id: `${SECTION_ID}-subtotal`, baseHeightPt: 18, atomic: true, ref: { sectionId: SECTION_ID } },
        { kind: 'totals', id: 'totals', baseHeightPt: 80, atomic: true },
        { kind: 'terms-card', id: 'terms-payment', baseHeightPt: 30, atomic: true, ref: { termsKey: 'payment' } },
        { kind: 'photo-row', id: 'photos-0', baseHeightPt: 120, atomic: true, ref: { photoRange: [0, 1] } },
      ],
    },
  ]
  return { data, pages }
}

function renderPreview(overrides: Partial<PaginatedPreviewProps> = {}) {
  const { data, pages } = buildFixture()
  return render(
    <PaginatedPreview
      data={data}
      pages={pages}
      company={company}
      language="en"
      client={null}
      projectName="Test Project"
      projectType={null}
      preparedBy={null}
      estimateVersion={1}
      estimateSeq={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
      companyTerms={null}
      templateId="classic"
      {...overrides}
    />
  )
}

function openDropdown(triggerEl: Element) {
  fireEvent.pointerDown(triggerEl, { button: 0, ctrlKey: false })
  fireEvent.pointerUp(triggerEl, { button: 0 })
  fireEvent.click(triggerEl)
}

function sheet(container: HTMLElement) {
  return container.querySelector('[data-page-sheet="0"]') as HTMLElement
}

function row(container: HTMLElement, itemId: string) {
  return container.querySelector(`[data-item-id="${itemId}"]`) as HTMLElement
}

describe.each(['classic', 'modern'] as const)('PaginatedPreview editing — %s', (templateId) => {
  it('without dispatch: no editable affordance at all', () => {
    const { container } = renderPreview({ templateId })
    expect(sheet(container).querySelectorAll('[role="button"], input, textarea, button').length).toBe(0)
  })

  it('description: edits in place and dispatches once, on Enter', () => {
    const dispatch = vi.fn()
    const { container } = renderPreview({ templateId, dispatch })
    fireEvent.focus(within(row(container, 'item-0')).getByRole('button', { name: 'Description' }))
    const input = within(row(container, 'item-0')).getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('Line item 0')

    fireEvent.change(input, { target: { value: 'Tear out cabinets' } })
    expect(dispatch).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ITEM',
      sectionId: SECTION_ID,
      itemId: 'item-0',
      field: 'description',
      value: 'Tear out cabinets',
    })
  })

  it('description: Escape discards, and an emptied description is not committed (it would hide the line)', () => {
    const dispatch = vi.fn()
    const { container } = renderPreview({ templateId, dispatch })
    const r = row(container, 'item-0')

    fireEvent.focus(within(r).getByRole('button', { name: 'Description' }))
    fireEvent.change(within(r).getByRole('textbox'), { target: { value: 'Something else' } })
    fireEvent.keyDown(within(r).getByRole('textbox'), { key: 'Escape' })

    fireEvent.focus(within(r).getByRole('button', { name: 'Description' }))
    fireEvent.change(within(r).getByRole('textbox'), { target: { value: '   ' } })
    fireEvent.keyDown(within(r).getByRole('textbox'), { key: 'Enter' })

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('quantity and unit price parse on commit', () => {
    const dispatch = vi.fn()
    const { container } = renderPreview({ templateId, dispatch })
    const r = row(container, 'item-1')

    fireEvent.focus(within(r).getByRole('button', { name: 'Qty' }))
    const qty = within(r).getByRole('textbox')
    fireEvent.change(qty, { target: { value: '3.5' } })
    fireEvent.blur(qty)
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'UPDATE_ITEM', sectionId: SECTION_ID, itemId: 'item-1', field: 'quantity', value: 3.5,
    })

    fireEvent.focus(within(r).getByRole('button', { name: 'Unit Price' }))
    const price = within(r).getByRole('textbox')
    fireEvent.change(price, { target: { value: '$1,234.50' } })
    fireEvent.keyDown(price, { key: 'Enter' })
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'UPDATE_ITEM', sectionId: SECTION_ID, itemId: 'item-1', field: 'unit_price', value: 1234.5,
    })
  })

  it('section title commits UPDATE_SECTION_TITLE', () => {
    const dispatch = vi.fn()
    const { container } = renderPreview({ templateId, dispatch })
    const header = container.querySelector(`[data-page-block-id="${SECTION_ID}-header"]`) as HTMLElement
    fireEvent.focus(within(header).getByText('Demolition'))
    const field = within(header).getByRole('textbox')
    fireEvent.change(field, { target: { value: 'Demo & haul-away' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'UPDATE_SECTION_TITLE', sectionId: SECTION_ID, title: 'Demo & haul-away' })
  })

  it('summary and terms are multi-line: Enter is a newline, blur commits', () => {
    const dispatch = vi.fn()
    const { container } = renderPreview({ templateId, dispatch })

    fireEvent.focus(within(sheet(container)).getByRole('button', { name: 'Summary' }))
    const summary = within(sheet(container)).getByRole('textbox')
    fireEvent.keyDown(summary, { key: 'Enter' })
    expect(dispatch).not.toHaveBeenCalled()
    fireEvent.change(summary, { target: { value: 'Line one\nLine two' } })
    fireEvent.blur(summary)
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'UPDATE_FIELD', field: 'summary', value: 'Line one\nLine two' })

    fireEvent.focus(within(sheet(container)).getByRole('button', { name: 'Payment Terms' }))
    const terms = within(sheet(container)).getByRole('textbox')
    fireEvent.change(terms, { target: { value: 'Net 15' } })
    fireEvent.keyDown(terms, { key: 'Enter', ctrlKey: true })
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'UPDATE_FIELD', field: 'payment_terms', value: 'Net 15' })
  })

  it('"Add item" creates the line only once it has a description', () => {
    const dispatch = vi.fn()
    const { container } = renderPreview({ templateId, dispatch })
    const subtotal = container.querySelector(`[data-page-block-id="${SECTION_ID}-subtotal"]`) as HTMLElement

    fireEvent.click(within(subtotal).getByRole('button', { name: /add item/i }))
    const field = within(subtotal).getByRole('textbox')
    fireEvent.keyDown(field, { key: 'Enter' }) // empty — cancels, creates nothing
    expect(dispatch).not.toHaveBeenCalled()

    fireEvent.click(within(subtotal).getByRole('button', { name: /add item/i }))
    const field2 = within(subtotal).getByRole('textbox')
    fireEvent.change(field2, { target: { value: 'Haul debris' } })
    fireEvent.keyDown(field2, { key: 'Enter' })

    expect(dispatch).toHaveBeenCalledTimes(1)
    const action = dispatch.mock.calls[0][0]
    expect(action).toMatchObject({ type: 'ADD_ITEM', sectionId: SECTION_ID, description: 'Haul debris' })
    expect(action.itemId).toMatch(/^temp-/)
    // The field closes after creating the line.
    expect(within(subtotal).queryByRole('textbox')).toBeNull()
  })

  it('"Add section" asks for the first line before creating the section', () => {
    const dispatch = vi.fn()
    renderPreview({ templateId, dispatch })
    fireEvent.click(screen.getByRole('button', { name: /add section/i }))
    const submit = screen.getAllByRole('button', { name: /add section/i }).at(-1)!
    expect((submit as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByPlaceholderText('Section title'), { target: { value: 'Painting' } })
    fireEvent.change(screen.getByPlaceholderText('First line description'), { target: { value: 'Prime walls' } })
    fireEvent.click(submit)
    expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_SECTION', title: 'Painting', firstItemDescription: 'Prime walls' })
  })

  it('line menu: move down swaps with the next line; the first line cannot move up', () => {
    const dispatch = vi.fn()
    const { container } = renderPreview({ templateId, dispatch })
    openDropdown(within(row(container, 'item-0')).getByRole('button', { name: 'Line actions' }))
    const up = screen.getByRole('menuitem', { name: 'Move up' })
    expect(up.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'REORDER_ITEMS', sectionId: SECTION_ID, itemIds: ['item-1', 'item-0'] })
  })

  it('line menu: a line discount is set from a popover and commits on Enter', () => {
    const dispatch = vi.fn()
    const { container } = renderPreview({ templateId, dispatch })
    openDropdown(within(row(container, 'item-1')).getByRole('button', { name: 'Line actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add line discount' }))
    const field = screen.getByRole('textbox', { name: 'Line discount' })
    fireEvent.change(field, { target: { value: '25' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ITEM', sectionId: SECTION_ID, itemId: 'item-1', field: 'discount', value: 25,
    })
  })

  it('totals: discount, tax (with reset to default) and deposit edit from one popover', () => {
    const dispatch = vi.fn()
    renderPreview({ templateId, dispatch, defaultTaxRate: 0.05 })
    fireEvent.click(screen.getByRole('button', { name: 'Edit discount, tax and deposit' }))

    const discountField = screen.getByRole('textbox', { name: 'Discount' }) as HTMLInputElement
    expect(discountField.value).toBe('10')
    fireEvent.change(discountField, { target: { value: '15' } })
    fireEvent.keyDown(discountField, { key: 'Enter' })
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'UPDATE_DISCOUNT', discount_type: 'percentage', discount_value: 15 })

    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Discount' })).getByRole('radio', { name: 'None' }))
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'UPDATE_DISCOUNT', discount_type: null, discount_value: 0 })

    const tax = screen.getByRole('textbox', { name: 'Tax' })
    fireEvent.change(tax, { target: { value: '7' } })
    fireEvent.blur(tax)
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'UPDATE_TAX_RATE', tax_rate: 0.07 })
    fireEvent.click(screen.getByRole('button', { name: /reset to default \(5%\)/i }))
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'UPDATE_TAX_RATE', tax_rate: 0.05 })

    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Deposit' })).getByRole('radio', { name: '$' }))
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'UPDATE_DEPOSIT', deposit_type: 'amount', deposit_value: 30 })
  })

  it('photos: the remove button detaches the photo', () => {
    const onDetachPhoto = vi.fn()
    renderPreview({ templateId, dispatch: vi.fn(), onDetachPhoto })
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(onDetachPhoto).toHaveBeenCalledWith(PHOTO_WITH_CAPTION.id)
  })

  it('client: "Link client" when none, the Bill To cell otherwise — both open the client panel', () => {
    const onOpenClientPanel = vi.fn()
    const { unmount } = renderPreview({ templateId, dispatch: vi.fn(), onOpenClientPanel })
    fireEvent.click(screen.getByRole('button', { name: 'Link client' }))
    expect(onOpenClientPanel).toHaveBeenCalledTimes(1)
    unmount()

    renderPreview({
      templateId,
      dispatch: vi.fn(),
      onOpenClientPanel,
      client: { name: 'Pat Client', email: 'pat@example.test', phone: null } as PaginatedPreviewProps['client'],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Change client' }))
    expect(onOpenClientPanel).toHaveBeenCalledTimes(2)
  })
})

describe('parseLooseNumber', () => {
  it.each([
    ['12', 12],
    ['3.5', 3.5],
    ['$1,234.50', 1234.5],
    ['1.234,50', 1234.5],
    ['12,5', 12.5],
    ['1,000', 1000],
    ['R$ 99', 99],
  ])('%s -> %d', (raw, expected) => {
    expect(parseLooseNumber(raw)).toBe(expected)
  })

  it('returns NaN when nothing is numeric', () => {
    expect(parseLooseNumber('abc')).toBeNaN()
  })
})
