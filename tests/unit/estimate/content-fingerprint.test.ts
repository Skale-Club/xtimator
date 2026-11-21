// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  buildSignableSnapshot,
  computeContentFingerprint,
  fingerprintSignedContent,
} from '@/lib/estimate/content-fingerprint'
import {
  canonicalJsonStringify,
  SIGN_CONSENT_KEY,
  SIGN_CONSENT_STATEMENT,
} from '@/lib/estimate/signed-snapshot'

const estimate = {
  summary: 'Kitchen remodel',
  notes: null,
  timeline: '2 weeks',
  payment_terms: null,
  warranty_terms: null,
  estimate_date: '2026-11-21',
  estimate_number: 'EST-1001',
  subtotal: 1000,
  tax_rate: 0,
  tax_amount: 0,
  discount_type: null,
  discount_value: null,
  discount_amount: null,
  deposit_type: 'none',
  deposit_value: null,
  balance_due: 1000,
  total: 1000,
  currency_code: 'USD',
  presentation_settings: null,
}

const sections = () => [
  {
    id: 's1',
    title: 'Labor',
    sort_order: 0,
    subtotal: 1000,
    items: [
      { id: 'i1', description: 'Demo old cabinets', quantity: 1, unit: 'each', unit_price: 400, total: 400, sort_order: 0 },
      { id: 'i2', description: 'Install new cabinets', quantity: 1, unit: 'each', unit_price: 600, total: 600, sort_order: 1 },
    ],
  },
]

const company = { estimate_terms_enabled: true, estimate_terms_text: 'Net 15.' }

describe('content fingerprint: what the client would be signing', () => {
  const base = computeContentFingerprint(estimate, sections(), company)

  it('is a SHA-256 hex digest of the canonical signed snapshot', () => {
    expect(base).toMatch(/^[0-9a-f]{64}$/)
    const snapshot = buildSignableSnapshot(estimate, sections(), company)
    expect(fingerprintSignedContent(snapshot)).toBe(base)
    expect(createHash('sha256').update(canonicalJsonStringify(snapshot)).digest('hex')).toBe(base)
  })

  it('freezes the consent statement and the company terms in the snapshot', () => {
    const snapshot = buildSignableSnapshot(estimate, sections(), company)
    expect(snapshot.version).toBe(2)
    expect(snapshot.consent).toEqual({ statement: SIGN_CONSENT_STATEMENT, key: SIGN_CONSENT_KEY })
    expect(snapshot.company_terms).toEqual({ enabled: true, text: 'Net 15.' })
  })

  it('is stable for the same content, whatever the row and key order', () => {
    const reordered = sections()
    reordered[0].items.reverse()
    const shuffledEstimate = Object.fromEntries(Object.entries(estimate).reverse()) as typeof estimate
    expect(computeContentFingerprint(shuffledEstimate, reordered, company)).toBe(base)
  })

  it('ignores columns the snapshot does not freeze (owner-only cost, markup, AI metadata)', () => {
    // The public page strips these before fingerprinting; the sign route reads
    // the full rows. Both must land on the same value.
    const full = sections()
    Object.assign(full[0].items[0], { cost: 250, markup_pct: 60, ai_confidence: 0.4, price_source: 'ai_estimate' })
    const fullEstimate = { ...estimate, ai_meta: { model: 'x' }, share_password_hash: 'h', updated_at: 'now' }
    expect(computeContentFingerprint(fullEstimate, full, { ...company, name: 'Co' } as typeof company)).toBe(base)
  })

  it('changes when only the wording of a line changes (same totals)', () => {
    const edited = sections()
    edited[0].items[0].description = 'Demo old cabinets and haul away'
    expect(computeContentFingerprint(estimate, edited, company)).not.toBe(base)
  })

  it('changes when a section title or the line order changes', () => {
    const renamed = sections()
    renamed[0].title = 'Labour'
    expect(computeContentFingerprint(estimate, renamed, company)).not.toBe(base)

    const swapped = sections()
    swapped[0].items[0].sort_order = 1
    swapped[0].items[1].sort_order = 0
    expect(computeContentFingerprint(estimate, swapped, company)).not.toBe(base)
  })

  it('changes when the company terms change, are switched off or are removed', () => {
    expect(computeContentFingerprint(estimate, sections(), { ...company, estimate_terms_text: 'Net 30.' })).not.toBe(base)
    expect(computeContentFingerprint(estimate, sections(), { ...company, estimate_terms_enabled: false })).not.toBe(base)
    expect(computeContentFingerprint(estimate, sections(), null)).not.toBe(base)
  })

  it('treats a missing company row like terms switched off with no text', () => {
    expect(computeContentFingerprint(estimate, sections(), null)).toBe(
      computeContentFingerprint(estimate, sections(), { estimate_terms_enabled: false, estimate_terms_text: null })
    )
    expect(computeContentFingerprint(estimate, sections(), undefined)).toBe(
      computeContentFingerprint(estimate, sections(), {})
    )
  })
})
