// tests/unit/pdf/estimate-pdf-totals.test.tsx
// PUI-02 (v4.11) — structural assertion of the PDF totals block (plan 134-02).
//
// Rendering @react-pdf/renderer to a real PDF is impractical headlessly, so we call the
// EstimatePDF function component directly and walk the returned React element tree,
// collecting the text content of <Text> primitives IN DOCUMENT ORDER. We then assert the
// presence/absence + ORDER of the Subtotal / Tax / Total / Deposit / Balance Due rows and
// their persisted money strings.
//
// GUARD-03: the Deposit row value (-$300.00) is total − persisted balance_due, NOT a
// recompute from deposit_value. Test 3 proves the PDF trusts the persisted balance_due.

import { describe, it, expect } from 'vitest'
import { isValidElement } from 'react'
import { Text } from '@react-pdf/renderer'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import type { EstimateWithSections } from '@/lib/queries/estimate'

// Walk a React element tree and return the flattened text content of every <Text> primitive,
// in depth-first document order. Each entry is the concatenation of that Text node's string/
// number leaf descendants (so "-$300.00" stays a single ordered entry).
function collectTextNodes(node: unknown, out: string[]): void {
  if (node == null || node === false || node === true) return
  if (typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) {
    for (const child of node) collectTextNodes(child, out)
    return
  }
  if (isValidElement(node)) {
    const el = node as { type: unknown; props: { children?: unknown } }
    if (el.type === Text) {
      out.push(flattenText(el.props.children))
      return
    }
    collectTextNodes(el.props?.children, out)
  }
}

// Concatenate the string/number leaves of a Text node's children (ignores nested elements'
// structure but keeps their text — adequate for our label/value assertions).
function flattenText(children: unknown): string {
  if (children == null || children === false || children === true) return ''
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(flattenText).join('')
  if (isValidElement(children)) {
    const el = children as { props: { children?: unknown } }
    return flattenText(el.props?.children)
  }
  return ''
}

function renderTexts(estimate: EstimateWithSections): string[] {
  // EstimatePDF is a plain function component — call it to get the element tree, then walk it.
  const tree = EstimatePDF({
    estimate,
    company: {
      name: 'Acme Co',
      owner_name: null,
      phone: null,
      email: null,
      website: null,
      address: null,
      city: null,
      state: null,
      zip: null,
      logo_url: null,
      brand_primary_color: null,
    },
    client: null,
    projectName: 'Test Project',
    projectType: null,
    language: 'en',
  })
  const out: string[] = []
  collectTextNodes(tree, out)
  return out
}

function baseEstimate(overrides: Partial<EstimateWithSections>): EstimateWithSections {
  return {
    id: 'est-1',
    project_id: 'proj-1',
    company_id: 'co-1',
    currency_code: 'USD',
    version: 1,
    estimate_seq: 1,
    estimate_number: null,
    estimate_date: null,
    is_current: true,
    share_token: 'tok',
    status: 'draft',
    language: 'en',
    summary: null,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    subtotal: 1000,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    total: 1000,
    deposit_type: 'none',
    deposit_value: null,
    balance_due: null,
    sent_at: null,
    viewed_at: null,
    responded_at: null,
    client_response: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    sections: [],
    ...overrides,
  }
}

describe('EstimatePDF totals block — deposit / balance due (PUI-02)', () => {
  it('legacy: deposit_type none, no discount, no tax → no Deposit / no Balance Due rows', () => {
    const texts = renderTexts(baseEstimate({}))
    expect(texts).toContain('Subtotal')
    // grandTotal label is 'Total' (en) — present
    expect(texts).toContain('Total')
    // No deposit rows at all — byte-identical to pre-v4.11
    expect(texts).not.toContain('Deposit')
    expect(texts).not.toContain('Balance Due')
  })

  it('with deposit: renders Subtotal → Total → Deposit (-$300.00) → Balance Due ($700.00) in order', () => {
    const texts = renderTexts(
      baseEstimate({
        total: 1000,
        subtotal: 1000,
        deposit_type: 'percent',
        deposit_value: 30,
        balance_due: 700,
      })
    )
    expect(texts).toContain('Deposit')
    expect(texts).toContain('Balance Due')

    const iSubtotal = texts.indexOf('Subtotal')
    const iGrandTotal = texts.lastIndexOf('Total')
    const iDeposit = texts.indexOf('Deposit')
    const iBalance = texts.indexOf('Balance Due')

    // Locked order: Subtotal → … → Total → Deposit → Balance Due
    expect(iSubtotal).toBeLessThan(iGrandTotal)
    expect(iGrandTotal).toBeLessThan(iDeposit)
    expect(iDeposit).toBeLessThan(iBalance)

    // Deposit value = total − persisted balance_due = 1000 − 700 = 300, shown negative
    expect(texts).toContain('-$300.00')
    // Balance due = persisted balance_due = 700
    expect(texts).toContain('$700.00')
  })

  it('reads persisted balance_due, never recomputes: balance_due 800 (mismatched) → Deposit -$200.00, Balance $800.00', () => {
    const texts = renderTexts(
      baseEstimate({
        total: 1000,
        subtotal: 1000,
        deposit_type: 'percent',
        deposit_value: 30, // would imply 700 if recomputed — but we TRUST balance_due
        balance_due: 800,
      })
    )
    // depositAmount = 1000 − 800 = 200 (proves trust-the-persisted, not 30% of 1000 = 300)
    expect(texts).toContain('-$200.00')
    expect(texts).toContain('$800.00')
    expect(texts).not.toContain('-$300.00')
  })
})
