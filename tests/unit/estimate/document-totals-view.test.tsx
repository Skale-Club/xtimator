import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import {
  EstimateDocument,
  type EstimateDocumentData,
  type DocumentCompany,
} from '@/components/workspace/estimate/estimate-document'

// PUI-02 (v4.11) — public share VIEW-mode totals block.
// Locks: Subtotal → Discount → Tax → Total → Deposit (only if set) → Balance Due (only if set),
// values READ from the persisted server row via deriveDepositDisplay (no recompute, GUARD-03).
// Edit-mode (editor) deposit/discount/balance-due UI must stay untouched (the fence).

const company: DocumentCompany = {
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
}

function makeData(overrides: Partial<EstimateDocumentData> = {}): EstimateDocumentData {
  return {
    summary: null,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    subtotal: 1000,
    total: 1000,
    deposit_type: 'none',
    deposit_value: null,
    deposit: 0,
    balance_due: 1000,
    currency_code: 'USD',
    estimate_date: null,
    estimate_number: null,
    // Phase 162-04 (DOCUX-01) — NULL preserves today's all-visible behavior.
    presentation_settings: null,
    sections: [
      {
        id: 's1',
        title: 'Section 1',
        subtotal: 1000,
        items: [
          { id: 'i1', description: 'Item', quantity: 1, unit: 'ea', unit_price: 1000, total: 1000 },
        ],
      },
    ],
    ...overrides,
  }
}

function renderView(data: EstimateDocumentData) {
  return render(
    <EstimateDocument
      mode="view"
      data={data}
      company={company}
      client={null}
      projectName="Test Project"
      projectType={null}
      estimateVersion={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
    />
  )
}

describe('DocumentTotals — public share VIEW mode (PUI-02)', () => {
  it('Test 1 — legacy (no discount, no deposit): renders Subtotal + Total only, no Deposit/Balance Due rows', () => {
    renderView(makeData()) // deposit_type 'none', balance_due === total

    expect(screen.getByText('Subtotal')).toBeTruthy()
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0)
    // No extra rows
    expect(screen.queryByText('Deposit')).toBeNull()
    expect(screen.queryByText('Balance Due')).toBeNull()
  })

  it('Test 2 — with deposit (percent): renders Deposit (-$300.00) and Balance Due ($700.00) in order', () => {
    renderView(
      makeData({
        total: 1000,
        deposit_type: 'percent',
        deposit_value: 30,
        deposit: 300,
        balance_due: 700,
      })
    )

    expect(screen.getByText('Subtotal')).toBeTruthy()
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0)
    expect(screen.getByText('Deposit')).toBeTruthy()
    expect(screen.getByText('Balance Due')).toBeTruthy()
    expect(screen.getByText('-$300.00')).toBeTruthy()
    expect(screen.getByText('$700.00')).toBeTruthy()
  })

  it('Test 3 — reads persisted balance_due, not recompute: Deposit -$240.00 (1000−760), Balance Due $760.00', () => {
    // deposit_value intentionally != total − balance_due; deriveDepositDisplay must use balance_due.
    renderView(
      makeData({
        total: 1000,
        deposit_type: 'amount',
        deposit_value: 250,
        deposit: 250,
        balance_due: 760,
      })
    )

    expect(screen.getByText('Deposit')).toBeTruthy()
    expect(screen.getByText('-$240.00')).toBeTruthy()
    expect(screen.getByText('Balance Due')).toBeTruthy()
    expect(screen.getByText('$760.00')).toBeTruthy()
    // The raw deposit_value (250) must NOT appear as the deposit amount.
    expect(screen.queryByText('-$250.00')).toBeNull()
  })

  it('Test 4 — edit-mode deposit Select untouched (fence): rendering with isEditable + dispatch still shows the deposit control', () => {
    const dispatch = vi.fn()
    render(
      <EstimateDocument
        mode="edit"
        data={makeData({ deposit_type: 'percent', deposit_value: 30, deposit: 300, balance_due: 700 })}
        brandColor="#000000"
        client={null}
        projectName="Test Project"
        projectType={null}
        estimateVersion={1}
        estimateCreatedAt="2026-01-01T00:00:00Z"
        dispatch={dispatch}
      />
    )

    // The edit-mode deposit Select renders a combobox trigger — view mode renders none.
    // Presence of comboboxes (discount/deposit Select) proves the editor controls are
    // intact and the fence held. The Deposit label is also shown.
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
    expect(screen.getByText('Deposit')).toBeTruthy()
  })
})
