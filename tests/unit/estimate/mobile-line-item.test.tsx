import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { ItemCardMobile } from '@/components/workspace/estimate/item-card-mobile'
import type { EditorItem } from '@/components/workspace/estimate/use-estimate-reducer'

// Phase 162 plan 162-05 (DOCUX-06) — mobile line-item editor rebuilt to match
// the desktop document-native table language: transparent inputs on the paper
// surface, NO glass card wrapper, 44px touch targets preserved on the trash
// button + Switch container.
//
// These replace the Wave 0 (162-01) placeholder pending-test scaffolds.
// Every assertion below is grounded in the DOCUX-06 truths from
// 162-05-PLAN.md's must_haves block.

// ---- Stub EditorItem builder (mirrors the shape used in the retired
// price-badge.test.tsx, extended with v4.11 advanced-pricing fields) ----
function makeItem(overrides: Partial<EditorItem> = {}): EditorItem {
  return {
    id: 'item-1',
    description: 'Test item',
    quantity: 2,
    unit: 'each',
    unit_price: 100,
    total: 200,
    sort_order: 0,
    price_source: null,
    isManuallyEdited: false,
    taxable: true,
    tax_category: null,
    discount: 0,
    cost: null,
    markup_pct: null,
    ...overrides,
  }
}

describe('mobile line-item editor (DOCUX-06)', () => {
  it('no glass card — rendered DOM does NOT contain the string "glass" as a class value', () => {
    const { container } = render(
      <ItemCardMobile item={makeItem()} onUpdate={vi.fn()} onRemove={vi.fn()} />
    )
    // A glass card would surface `variant="glass"` styles onto the outer
    // element. Walk every descendant and confirm no class list contains "glass".
    const glassNodes = container.querySelectorAll('[class*="glass"]')
    expect(glassNodes.length).toBe(0)
  })

  it('no glass card — no <Card> wrapper (the outer node is a <div>, not a Card)', () => {
    const { container } = render(
      <ItemCardMobile item={makeItem()} onUpdate={vi.fn()} onRemove={vi.fn()} />
    )
    // shadcn `Card` renders as `<div class="... rounded-lg border ...">`. The
    // structural distinction we care about is the ABSENCE of the glass variant
    // shell — assert the outer element is a plain `<div>` with the new
    // document-native row classes.
    const outer = container.firstChild as HTMLElement
    expect(outer).toBeTruthy()
    expect(outer.tagName).toBe('DIV')
    // The old Card wrapper always carried a `rounded-lg` shell class. The
    // new document-native row must NOT.
    expect(outer.className).not.toMatch(/rounded-lg/)
  })

  it('transparent inputs — description input uses INLINE_INPUT_CLS bg-transparent styling', () => {
    const { container } = render(
      <ItemCardMobile item={makeItem()} onUpdate={vi.fn()} onRemove={vi.fn()} />
    )
    const descInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Item description"]'
    )
    expect(descInput).toBeTruthy()
    expect(descInput!.className).toMatch(/bg-transparent/)
  })

  it('transparent inputs — qty input uses INLINE_INPUT_CLS text-right styling', () => {
    const { container } = render(
      <ItemCardMobile item={makeItem()} onUpdate={vi.fn()} onRemove={vi.fn()} />
    )
    const qtyInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Quantity"]'
    )
    expect(qtyInput).toBeTruthy()
    expect(qtyInput!.className).toMatch(/bg-transparent/)
    expect(qtyInput!.className).toMatch(/text-right/)
  })

  it('transparent inputs — unit-price MoneyInput uses bg-transparent border-0 shadow-none', () => {
    const { container } = render(
      <ItemCardMobile item={makeItem()} onUpdate={vi.fn()} onRemove={vi.fn()} />
    )
    // MoneyInput exposes its `name` prop through to the underlying <input>,
    // so we query by name to nail down the specific control under test.
    const unitPriceInput = container.querySelector<HTMLInputElement>(
      'input[name="unit_price"]'
    )
    expect(unitPriceInput).toBeTruthy()
    expect(unitPriceInput!.className).toMatch(/bg-transparent/)
    expect(unitPriceInput!.className).toMatch(/border-0/)
    expect(unitPriceInput!.className).toMatch(/shadow-none/)
  })

  it('touch targets — trash button preserves min-h-[44px] min-w-[44px]', () => {
    const { getByRole } = render(
      <ItemCardMobile item={makeItem()} onUpdate={vi.fn()} onRemove={vi.fn()} />
    )
    const trash = getByRole('button', { name: /remove item/i })
    expect(trash.className).toMatch(/min-h-\[44px\]/)
    expect(trash.className).toMatch(/min-w-\[44px\]/)
  })

  it('touch targets — Switch container preserves min-h-[44px]', () => {
    const { getByRole } = render(
      <ItemCardMobile item={makeItem()} onUpdate={vi.fn()} onRemove={vi.fn()} />
    )
    const taxSwitch = getByRole('switch', { name: /taxable/i })
    // The 44px minimum lives on the immediate wrapping div — the Switch itself
    // is a compact primitive.
    const wrapper = taxSwitch.parentElement
    expect(wrapper).toBeTruthy()
    expect(wrapper!.className).toMatch(/min-h-\[44px\]/)
  })

  it('row structure — border-b border-border/50 last:border-b-0 even:bg-muted/20', () => {
    const { container } = render(
      <ItemCardMobile item={makeItem()} onUpdate={vi.fn()} onRemove={vi.fn()} />
    )
    const outer = container.firstChild as HTMLElement
    expect(outer).toBeTruthy()
    expect(outer.className).toMatch(/border-b/)
    expect(outer.className).toMatch(/border-border\/50/)
    expect(outer.className).toMatch(/last:border-b-0/)
    expect(outer.className).toMatch(/even:bg-muted\/20/)
  })

  it('preserves onUpdate + onRemove props signature (same as current ItemCardMobile)', () => {
    // Compile-time contract: this render call MUST typecheck against the
    // rebuilt ItemCardMobile export. If the prop signature drifts (e.g. onUpdate
    // field union changes, or onRemove disappears), TypeScript would fail here
    // during `tsc --noEmit`. The runtime assertion just confirms the render did
    // not throw and produced a rendered DOM.
    const onUpdate = vi.fn<
      (
        field: 'description' | 'quantity' | 'unit' | 'unit_price' | 'discount' | 'taxable',
        value: string | number | boolean | null
      ) => void
    >()
    const onRemove = vi.fn<() => void>()
    const { container } = render(
      <ItemCardMobile
        item={makeItem()}
        onUpdate={onUpdate}
        onRemove={onRemove}
        isReadOnly={false}
        currencyCode="USD"
        unitOptions={['each', 'hour']}
      />
    )
    expect(container.firstChild).toBeTruthy()
  })
})
