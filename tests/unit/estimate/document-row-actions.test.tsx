// tests/unit/estimate/document-row-actions.test.tsx
//
// Row kebab menu (Add discount / Remove discount / Delete line) + section
// header kebab (Delete section) + the Disc. column's hide-until-used
// behavior, all in EstimateDocument's edit-mode desktop table. Also guards
// the $-overlap regression fix (MoneyInput call sites use pl-6, not p-1).
//
// Radix DropdownMenu interaction in jsdom: mirrors
// tests/unit/price-book/price-book-list.test.tsx's openDropdown helper
// (pointerdown -> pointerup -> click on the trigger).

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import {
  EstimateDocument,
  type EstimateDocumentData,
  type DocumentCompany,
} from '@/components/workspace/estimate/estimate-document'
import {
  buildFixtureEstimate,
  toFixtureDocumentData,
  FIXTURE_COMPANY,
} from './fixtures/document-fixtures'

afterEach(cleanup)

function openDropdown(triggerEl: Element) {
  fireEvent.pointerDown(triggerEl, { button: 0, ctrlKey: false })
  fireEvent.pointerUp(triggerEl, { button: 0 })
  fireEvent.click(triggerEl)
}

const company: DocumentCompany = FIXTURE_COMPANY as DocumentCompany

function buildData(overrides: Record<string, unknown> = {}): EstimateDocumentData {
  return toFixtureDocumentData(buildFixtureEstimate(overrides)) as unknown as EstimateDocumentData
}

function renderDoc(data: EstimateDocumentData, dispatch = vi.fn()) {
  const utils = render(
    <EstimateDocument
      mode="edit"
      data={data}
      company={company}
      client={null}
      projectName="Test Project"
      projectType={null}
      estimateVersion={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
      dispatch={dispatch}
    />
  )
  return { ...utils, dispatch }
}

describe('EstimateDocument edit-mode row/section actions', () => {
  it('Disc. header cell is absent when every item discount is 0', () => {
    const data = buildData()
    renderDoc(data)
    expect(screen.queryByText('Disc.')).toBeNull()
  })

  it('Disc. header cell is present when some item has discount > 0', () => {
    const data = buildData()
    // fixture's first Materials item gets a non-zero discount.
    data.sections[1].items[0] = { ...data.sections[1].items[0], discount: 25 }
    renderDoc(data)
    expect(screen.getByText('Disc.')).toBeTruthy()
  })

  it('row kebab menu opens and "Delete line" dispatches REMOVE_ITEM with the right sectionId/itemId', () => {
    const data = buildData()
    const { container, dispatch } = renderDoc(data)

    const targetItemId = data.sections[0].items[0].id
    const targetSectionId = data.sections[0].id
    const row = container.querySelector(`[data-item-id="${targetItemId}"]`)
    expect(row).toBeTruthy()
    const kebabTrigger = row!.querySelector('button[aria-label="Line actions"]')
    expect(kebabTrigger).toBeTruthy()

    openDropdown(kebabTrigger!)

    const deleteItem = screen.getByRole('menuitem', { name: 'Delete line' })
    fireEvent.click(deleteItem)

    expect(dispatch).toHaveBeenCalledWith({
      type: 'REMOVE_ITEM',
      sectionId: targetSectionId,
      itemId: targetItemId,
    })
  })

  it('"Add discount" from the kebab reveals the Disc. column', () => {
    const data = buildData()
    const { container } = renderDoc(data)

    // No Disc. column at rest (all discounts 0).
    expect(screen.queryByText('Disc.')).toBeNull()

    const targetItemId = data.sections[0].items[0].id
    const row = container.querySelector(`[data-item-id="${targetItemId}"]`)
    const kebabTrigger = row!.querySelector('button[aria-label="Line actions"]')
    openDropdown(kebabTrigger!)

    const addDiscountItem = screen.getByRole('menuitem', { name: 'Add discount' })
    fireEvent.click(addDiscountItem)

    expect(screen.getByText('Disc.')).toBeTruthy()
  })

  it('section header kebab "Delete section" dispatches REMOVE_SECTION', () => {
    const data = buildData()
    const { container, dispatch } = renderDoc(data)

    const targetSectionId = data.sections[0].id
    const header = container.querySelector(`[data-page-block-id="${targetSectionId}-header"]`)
    expect(header).toBeTruthy()
    const kebabTrigger = header!.querySelector('button[aria-label="Section actions"]')
    expect(kebabTrigger).toBeTruthy()

    openDropdown(kebabTrigger!)

    const deleteSectionItem = screen.getByRole('menuitem', { name: 'Delete section' })
    fireEvent.click(deleteSectionItem)

    expect(dispatch).toHaveBeenCalledWith({
      type: 'REMOVE_SECTION',
      sectionId: targetSectionId,
    })
  })

  it('the two MoneyInput call sites (unit price + discount) use pl-6 (guards the $-overlap regression)', () => {
    const data = buildData()
    // Give the target item a discount so its Disc. MoneyInput cell renders too.
    const targetItemId = data.sections[0].items[0].id
    data.sections[0].items[0] = { ...data.sections[0].items[0], discount: 10 }
    const { container } = renderDoc(data)

    const row = container.querySelector(`[data-item-id="${targetItemId}"]`)
    expect(row).toBeTruthy()
    // MoneyInput hardcodes inputMode="numeric"; the row's other numeric
    // control (quantity) does not set inputMode, so this selects exactly
    // the unit-price and discount MoneyInput instances within the row.
    const moneyInputs = row!.querySelectorAll<HTMLInputElement>('input[inputmode="numeric"]')
    expect(moneyInputs.length).toBe(2)
    moneyInputs.forEach((input) => {
      expect(input.className).toContain('pl-6')
      expect(input.className).not.toMatch(/(^|\s)p-1(\s|$)/)
    })
  })
})
