import { describe, it, expect } from 'vitest'
import {
  buildSignedContentSnapshot,
  type SnapshotSourceEstimate,
  type SnapshotSourceSection,
} from '@/lib/estimate/signed-snapshot'

// TRUST-01 (Phase 164 Plan 01): the serializer captured at sign time
// (app/api/estimates/[id]/sign/route.ts) must mirror EXACTLY what the
// share query payload (lib/queries/share.ts:117-138) and the signed document
// renderers (estimate-document-modern.tsx / estimate-view.tsx / deriveDepositDisplay)
// actually show — every rendered + user-editable field, or post-sign drift
// survives via the omission.

const fullEstimate: SnapshotSourceEstimate = {
  summary: 'Kitchen remodel, full gut',
  notes: 'Client wants soft-close cabinets',
  timeline: '3-4 weeks',
  payment_terms: 'Net 15',
  warranty_terms: '1 year labor',
  estimate_date: '2026-07-10',
  estimate_number: 'EST-1042',
  subtotal: 10000,
  tax_rate: 0.0825,
  tax_amount: 825,
  discount_type: 'percentage',
  discount_value: 10,
  discount_amount: 1000,
  deposit_type: 'percent',
  deposit_value: 30,
  balance_due: 6877.5,
  total: 9825,
  currency_code: 'USD',
  presentation_settings: { sections: { notes: false } },
}

const twoSectionsThreeItems: SnapshotSourceSection[] = [
  {
    id: 'sec-2',
    title: 'Electrical',
    sort_order: 2,
    subtotal: 2000,
    items: [
      {
        id: 'item-b',
        description: 'Rewire panel',
        quantity: 1,
        unit: 'ea',
        unit_price: 2000,
        total: 2000,
        sort_order: 1,
        taxable: false,
        tax_category: 'labor',
        discount: 50,
      },
    ],
  },
  {
    id: 'sec-1',
    title: 'Cabinets',
    sort_order: 1,
    subtotal: 8000,
    items: [
      {
        id: 'item-a2',
        description: 'Install upper cabinets',
        quantity: 10,
        unit: 'lf',
        unit_price: 500,
        total: 5000,
        sort_order: 2,
        taxable: true,
        tax_category: 'materials',
        discount: 0,
      },
      {
        id: 'item-a1',
        description: 'Demo existing cabinets',
        quantity: 1,
        unit: 'job',
        unit_price: 3000,
        total: 3000,
        sort_order: 1,
        taxable: true,
        tax_category: null,
        discount: null,
      },
    ],
  },
]

describe('buildSignedContentSnapshot', () => {
  it('serializes the full shape for a representative estimate (2 sections, 3 items, per-item taxable/discount populated)', () => {
    const snapshot = buildSignedContentSnapshot(fullEstimate, twoSectionsThreeItems)

    expect(snapshot.version).toBe(1)
    expect(snapshot.summary).toBe('Kitchen remodel, full gut')
    expect(snapshot.notes).toBe('Client wants soft-close cabinets')
    expect(snapshot.timeline).toBe('3-4 weeks')
    expect(snapshot.payment_terms).toBe('Net 15')
    expect(snapshot.warranty_terms).toBe('1 year labor')
    expect(snapshot.estimate_date).toBe('2026-07-10')
    expect(snapshot.estimate_number).toBe('EST-1042')
    expect(snapshot.subtotal).toBe(10000)
    expect(snapshot.tax_rate).toBe(0.0825)
    expect(snapshot.tax_amount).toBe(825)
    expect(snapshot.discount_type).toBe('percentage')
    expect(snapshot.discount_value).toBe(10)
    expect(snapshot.discount_amount).toBe(1000)
    expect(snapshot.deposit_type).toBe('percent')
    expect(snapshot.deposit_value).toBe(30)
    expect(snapshot.balance_due).toBe(6877.5)
    expect(snapshot.total).toBe(9825)
    expect(snapshot.currency_code).toBe('USD')
    expect(snapshot.presentation_settings).toEqual({ sections: { notes: false } })

    expect(snapshot.sections).toHaveLength(2)
  })

  it('sorts sections and items by sort_order regardless of input order', () => {
    const snapshot = buildSignedContentSnapshot(fullEstimate, twoSectionsThreeItems)

    expect(snapshot.sections.map((s) => s.id)).toEqual(['sec-1', 'sec-2'])
    expect(snapshot.sections[0].items.map((i) => i.id)).toEqual(['item-a1', 'item-a2'])
  })

  it('preserves section id + subtotal (React keys + GUARD-03 frozen subtotal)', () => {
    const snapshot = buildSignedContentSnapshot(fullEstimate, twoSectionsThreeItems)
    const cabinets = snapshot.sections.find((s) => s.id === 'sec-1')!
    const electrical = snapshot.sections.find((s) => s.id === 'sec-2')!

    expect(cabinets.subtotal).toBe(8000)
    expect(electrical.subtotal).toBe(2000)
  })

  it('preserves per-item id, taxable, tax_category, discount', () => {
    const snapshot = buildSignedContentSnapshot(fullEstimate, twoSectionsThreeItems)
    const rewire = snapshot.sections
      .flatMap((s) => s.items)
      .find((i) => i.id === 'item-b')!

    expect(rewire.taxable).toBe(false)
    expect(rewire.tax_category).toBe('labor')
    expect(rewire.discount).toBe(50)
  })

  it('missing optional fields serialize as null, NEVER undefined (JSONB-safe)', () => {
    const minimalEstimate: SnapshotSourceEstimate = {
      summary: null,
      notes: null,
      timeline: null,
      payment_terms: null,
      warranty_terms: null,
      estimate_date: null,
      estimate_number: null,
      subtotal: 100,
      tax_rate: 0,
      tax_amount: 0,
      discount_type: null,
      discount_value: null,
      discount_amount: null,
      deposit_type: null,
      deposit_value: null,
      balance_due: null,
      total: 100,
      // currency_code omitted entirely — must default to 'USD', not undefined
      presentation_settings: null,
    }
    const minimalSections: SnapshotSourceSection[] = [
      {
        id: 'sec-1',
        title: 'Only section',
        sort_order: 1,
        subtotal: 100,
        items: [
          {
            id: 'item-1',
            description: 'Only item',
            quantity: 1,
            unit: null,
            unit_price: 100,
            total: 100,
            sort_order: 1,
            // taxable / tax_category / discount omitted entirely
          },
        ],
      },
    ]

    const snapshot = buildSignedContentSnapshot(minimalEstimate, minimalSections)

    expect(snapshot.summary).toBeNull()
    expect(snapshot.notes).toBeNull()
    expect(snapshot.timeline).toBeNull()
    expect(snapshot.payment_terms).toBeNull()
    expect(snapshot.warranty_terms).toBeNull()
    expect(snapshot.estimate_date).toBeNull()
    expect(snapshot.estimate_number).toBeNull()
    expect(snapshot.discount_type).toBeNull()
    expect(snapshot.discount_value).toBeNull()
    expect(snapshot.discount_amount).toBeNull()
    expect(snapshot.deposit_type).toBeNull()
    expect(snapshot.deposit_value).toBeNull()
    expect(snapshot.balance_due).toBeNull()
    expect(snapshot.presentation_settings).toBeNull()
    expect(snapshot.currency_code).toBe('USD')

    const item = snapshot.sections[0].items[0]
    expect(item.unit).toBeNull()
    expect(item.taxable).toBeNull()
    expect(item.tax_category).toBeNull()
    expect(item.discount).toBeNull()

    // Never `undefined` anywhere in the serialized tree (JSONB round-trip safety).
    const raw = JSON.stringify(snapshot)
    const roundTripped = JSON.parse(raw)
    expect(roundTripped).toEqual(snapshot)
    expect(raw).not.toContain('undefined')
  })

  it('handles a section with no items (empty array, not a crash)', () => {
    const snapshot = buildSignedContentSnapshot(fullEstimate, [
      { id: 'sec-empty', title: 'Empty', sort_order: 1, subtotal: 0, items: [] },
    ])
    expect(snapshot.sections[0].items).toEqual([])
  })
})
