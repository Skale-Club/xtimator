import { describe, it, expect } from 'vitest'
import {
  buildSignedContentSnapshot,
  applySignedCompanyTerms,
  applySignedCompanyTermsValue,
  canonicalJsonStringify,
  SIGN_CONSENT_STATEMENT,
  SIGN_CONSENT_KEY,
  type SnapshotSourceEstimate,
  type SnapshotSourceSection,
  type SignedContentSnapshot,
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

// Representative v2 extras — company terms enabled with text, plus the
// canonical consent statement/key. Most tests below use this default; a
// dedicated describe block covers the disabled/empty/no-consent variants.
const defaultExtras = {
  companyTerms: { enabled: true, text: 'All work guaranteed for 1 year.' },
  consent: { statement: SIGN_CONSENT_STATEMENT, key: SIGN_CONSENT_KEY },
}

describe('buildSignedContentSnapshot', () => {
  it('serializes the full shape for a representative estimate (2 sections, 3 items, per-item taxable/discount populated)', () => {
    const snapshot = buildSignedContentSnapshot(fullEstimate, twoSectionsThreeItems, defaultExtras)

    expect(snapshot.version).toBe(2)
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
    const snapshot = buildSignedContentSnapshot(fullEstimate, twoSectionsThreeItems, defaultExtras)

    expect(snapshot.sections.map((s) => s.id)).toEqual(['sec-1', 'sec-2'])
    expect(snapshot.sections[0].items.map((i) => i.id)).toEqual(['item-a1', 'item-a2'])
  })

  it('preserves section id + subtotal (React keys + GUARD-03 frozen subtotal)', () => {
    const snapshot = buildSignedContentSnapshot(fullEstimate, twoSectionsThreeItems, defaultExtras)
    const cabinets = snapshot.sections.find((s) => s.id === 'sec-1')!
    const electrical = snapshot.sections.find((s) => s.id === 'sec-2')!

    expect(cabinets.subtotal).toBe(8000)
    expect(electrical.subtotal).toBe(2000)
  })

  it('preserves per-item id, taxable, tax_category, discount', () => {
    const snapshot = buildSignedContentSnapshot(fullEstimate, twoSectionsThreeItems, defaultExtras)
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

    const snapshot = buildSignedContentSnapshot(minimalEstimate, minimalSections, {
      companyTerms: { enabled: false, text: null },
      consent: null,
    })

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

    // v2 fields also degrade-safely to null, never undefined.
    expect(snapshot.company_terms).toEqual({ enabled: false, text: null })
    expect(snapshot.consent).toBeNull()

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
    const snapshot = buildSignedContentSnapshot(
      fullEstimate,
      [{ id: 'sec-empty', title: 'Empty', sort_order: 1, subtotal: 0, items: [] }],
      defaultExtras
    )
    expect(snapshot.sections[0].items).toEqual([])
  })
})

// Security-hardening S1 — v2 schema: company_terms + consent are frozen at
// sign time so a post-sign Settings > Terms edit can't silently change what
// a signed document is legally understood to say.
describe('buildSignedContentSnapshot — v2 company_terms + consent', () => {
  it('emits version 2 with company_terms + consent populated from extras', () => {
    const snapshot = buildSignedContentSnapshot(fullEstimate, twoSectionsThreeItems, {
      companyTerms: { enabled: true, text: 'All sales final.' },
      consent: { statement: SIGN_CONSENT_STATEMENT, key: SIGN_CONSENT_KEY },
    })

    expect(snapshot.version).toBe(2)
    expect(snapshot.company_terms).toEqual({ enabled: true, text: 'All sales final.' })
    expect(snapshot.consent).toEqual({
      statement: SIGN_CONSENT_STATEMENT,
      key: SIGN_CONSENT_KEY,
    })
  })

  it('freezes company_terms.enabled: false even when text is present (REPLACE, not a truthy-text shortcut)', () => {
    const snapshot = buildSignedContentSnapshot(fullEstimate, twoSectionsThreeItems, {
      companyTerms: { enabled: false, text: 'Terms text that should not render' },
      consent: null,
    })

    expect(snapshot.company_terms).toEqual({
      enabled: false,
      text: 'Terms text that should not render',
    })
    expect(snapshot.consent).toBeNull()
  })

  it('consent: null is preserved as null, never coerced to a default statement', () => {
    const snapshot = buildSignedContentSnapshot(fullEstimate, twoSectionsThreeItems, {
      companyTerms: { enabled: true, text: 'Terms' },
      consent: null,
    })

    expect(snapshot.consent).toBeNull()
  })
})

describe('applySignedCompanyTerms', () => {
  const liveCompany = {
    id: 'c1',
    estimate_terms_enabled: true,
    estimate_terms_text: 'LIVE terms, edited after signing',
  }

  const v2SnapshotWithTerms: SignedContentSnapshot = {
    ...buildSignedContentSnapshot(fullEstimate, twoSectionsThreeItems, {
      companyTerms: { enabled: false, text: 'FROZEN terms as of signing' },
      consent: { statement: SIGN_CONSENT_STATEMENT, key: SIGN_CONSENT_KEY },
    }),
  }

  it('v2 snapshot with company_terms: REPLACEs both fields wholesale, never merges', () => {
    const result = applySignedCompanyTerms(liveCompany, v2SnapshotWithTerms)

    expect(result.estimate_terms_enabled).toBe(false)
    expect(result.estimate_terms_text).toBe('FROZEN terms as of signing')
    // Untouched fields pass through unchanged.
    expect(result.id).toBe('c1')
  })

  it('v1 snapshot (no company_terms field): no-op, live company terms unchanged', () => {
    const v1Snapshot = {
      ...v2SnapshotWithTerms,
      version: 1 as const,
      company_terms: undefined,
    }
    delete (v1Snapshot as { company_terms?: unknown }).company_terms

    const result = applySignedCompanyTerms(liveCompany, v1Snapshot)

    expect(result).toEqual(liveCompany)
  })

  it('snapshot with company_terms explicitly null: no-op, live company terms unchanged', () => {
    const snapshotWithNullTerms: SignedContentSnapshot = {
      ...v2SnapshotWithTerms,
      company_terms: null,
    }

    const result = applySignedCompanyTerms(liveCompany, snapshotWithNullTerms)

    expect(result).toEqual(liveCompany)
  })

  it('null snapshot (no signature yet): no-op, never throws', () => {
    expect(applySignedCompanyTerms(liveCompany, null)).toEqual(liveCompany)
    expect(applySignedCompanyTerms(liveCompany, undefined)).toEqual(liveCompany)
  })
})

// Fix-pack F1 (finding #6) — the sibling entry point that takes the extracted
// {enabled, text} value directly instead of a whole SignedContentSnapshot,
// used by lib/queries/estimate.ts's getEstimateWithContext to overlay from an
// already-loaded estimate.signedCompanyTerms rather than re-fetching the
// snapshot a second time. applySignedCompanyTerms now delegates to this.
describe('applySignedCompanyTermsValue', () => {
  const liveCompany = {
    id: 'c1',
    estimate_terms_enabled: true,
    estimate_terms_text: 'LIVE terms, edited after signing',
  }

  it('non-null companyTerms: REPLACEs both fields wholesale, never merges', () => {
    const result = applySignedCompanyTermsValue(liveCompany, {
      enabled: false,
      text: 'FROZEN terms as of signing',
    })

    expect(result.estimate_terms_enabled).toBe(false)
    expect(result.estimate_terms_text).toBe('FROZEN terms as of signing')
    expect(result.id).toBe('c1')
  })

  it('null/undefined companyTerms: no-op, live company terms unchanged, never throws', () => {
    expect(applySignedCompanyTermsValue(liveCompany, null)).toEqual(liveCompany)
    expect(applySignedCompanyTermsValue(liveCompany, undefined)).toEqual(liveCompany)
  })

  it('agrees with applySignedCompanyTerms for the equivalent whole-snapshot call', () => {
    const snapshot = buildSignedContentSnapshot(fullEstimate, twoSectionsThreeItems, {
      companyTerms: { enabled: false, text: 'FROZEN terms as of signing' },
      consent: null,
    })

    const viaSnapshot = applySignedCompanyTerms(liveCompany, snapshot)
    const viaValue = applySignedCompanyTermsValue(liveCompany, snapshot.company_terms)

    expect(viaValue).toEqual(viaSnapshot)
  })
})

// Fix-pack F1 (finding #3) — canonicalJsonStringify: sorted-key JSON
// serialization so a SHA-256 hash over signed_content can be reproduced after
// a round-trip through a jsonb column, which discards key-insertion order.
describe('canonicalJsonStringify', () => {
  it('(a) two objects with identical content but different key insertion order produce identical canonical output', () => {
    const insertedAB = { a: 1, b: { x: 'hi', y: [1, 2, 3] }, c: null }
    const insertedBA = { c: null, b: { y: [1, 2, 3], x: 'hi' }, a: 1 }

    expect(canonicalJsonStringify(insertedAB)).toBe(canonicalJsonStringify(insertedBA))
  })

  it('(a) holds for a realistic SignedContentSnapshot with reordered top-level keys', () => {
    const snapshot = buildSignedContentSnapshot(fullEstimate, twoSectionsThreeItems, defaultExtras)
    const reordered = Object.fromEntries(Object.entries(snapshot).reverse())

    expect(canonicalJsonStringify(reordered)).toBe(canonicalJsonStringify(snapshot))
  })

  it('(b) canonical output survives a JSON.parse(JSON.stringify(x)) round-trip unchanged', () => {
    const snapshot = buildSignedContentSnapshot(fullEstimate, twoSectionsThreeItems, defaultExtras)
    const roundTripped = JSON.parse(JSON.stringify(snapshot))

    expect(canonicalJsonStringify(roundTripped)).toBe(canonicalJsonStringify(snapshot))
  })

  it('sorts nested object keys at every depth, not just the top level', () => {
    const nested = { z: { b: 2, a: 1 }, a: { d: 4, c: 3 } }
    expect(canonicalJsonStringify(nested)).toBe('{"a":{"c":3,"d":4},"z":{"a":1,"b":2}}')
  })

  it('preserves array element order (arrays are never sorted)', () => {
    expect(canonicalJsonStringify([3, 1, 2])).toBe('[3,1,2]')
  })

  it('omits undefined object-property values, exactly like JSON.stringify', () => {
    const withUndefined = { a: 1, b: undefined, c: 2 }
    // Keys 'a' and 'c' are already alphabetical, so canonical (sorted) output
    // matches JSON.stringify's insertion-order output here regardless.
    expect(canonicalJsonStringify(withUndefined)).toBe(JSON.stringify({ a: 1, c: 2 }))
  })

  it('serializes an undefined array element as null, exactly like JSON.stringify', () => {
    const arr = [1, undefined, 3]
    expect(canonicalJsonStringify(arr)).toBe(JSON.stringify(arr))
  })

  it('serializes null, booleans, and strings identically to JSON.stringify', () => {
    expect(canonicalJsonStringify(null)).toBe('null')
    expect(canonicalJsonStringify(true)).toBe('true')
    expect(canonicalJsonStringify('hello "world"')).toBe(JSON.stringify('hello "world"'))
  })

  it('serializes NaN/Infinity as null, exactly like JSON.stringify', () => {
    expect(canonicalJsonStringify(Number.NaN)).toBe('null')
    expect(canonicalJsonStringify(Number.POSITIVE_INFINITY)).toBe('null')
  })

  it('produces a DIFFERENT hash-relevant output when actual content differs (sanity check — not order-blind to real changes)', () => {
    const a = { total: 100, notes: 'original' }
    const b = { total: 100, notes: 'tampered' }
    expect(canonicalJsonStringify(a)).not.toBe(canonicalJsonStringify(b))
  })
})
