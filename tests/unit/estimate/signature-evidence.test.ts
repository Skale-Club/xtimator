// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  buildSignatureEvidence,
  describeUserAgent,
  verifySignatureIntegrity,
  type SignatureEvidenceRow,
} from '@/lib/estimate/signature-evidence'
import { buildSignableSnapshot, fingerprintSignedContent } from '@/lib/estimate/content-fingerprint'

const snapshot = buildSignableSnapshot(
  {
    summary: 'Kitchen', notes: null, timeline: null, payment_terms: null, warranty_terms: null,
    estimate_date: '2026-11-21', estimate_number: 'EST-1', subtotal: 1000, tax_rate: 0, tax_amount: 0,
    discount_type: null, discount_value: null, discount_amount: null, deposit_type: 'none',
    deposit_value: null, balance_due: 1000, total: 1000, currency_code: 'USD', presentation_settings: null,
  },
  [{ id: 's1', title: 'Labor', sort_order: 0, subtotal: 1000, items: [] }],
  { estimate_terms_enabled: true, estimate_terms_text: 'Net 15.' }
)
const sha = fingerprintSignedContent(snapshot)

function row(overrides: Partial<SignatureEvidenceRow> = {}): SignatureEvidenceRow {
  return {
    signer_name: 'Jane Client',
    signer_email: 'jane@example.com',
    signed_at: '2026-11-21T20:25:00Z',
    ip_address: '203.0.113.9',
    user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    signature_data: 'data:image/png;base64,AAA',
    signed_content: snapshot,
    signed_total: '1000.00',
    snapshot_sha256: sha,
    ...overrides,
  }
}

describe('signature integrity', () => {
  it('verified when the stored snapshot still hashes to the stored value', () => {
    expect(verifySignatureIntegrity(snapshot, sha)).toBe('verified')
    expect(verifySignatureIntegrity(snapshot, sha.toUpperCase())).toBe('verified')
  })

  it('mismatch when the stored snapshot was altered after signing', () => {
    const tampered = { ...snapshot, total: 1 }
    expect(verifySignatureIntegrity(tampered, sha)).toBe('mismatch')
  })

  it('unavailable for a signature without a stored hash or without a snapshot', () => {
    expect(verifySignatureIntegrity(snapshot, null)).toBe('unavailable')
    expect(verifySignatureIntegrity(null, sha)).toBe('unavailable')
  })
})

describe('describeUserAgent', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', 'Safari on iPhone'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36', 'Chrome on Android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0', 'Edge on Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Gecko/20100101 Firefox/133.0', 'Firefox on Mac'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/131.0 Mobile/15E148 Safari/604.1', 'Chrome on iPhone'],
  ])('%s -> %s', (ua, expected) => {
    expect(describeUserAgent(ua)).toBe(expected)
  })

  it('null for an empty or unknown user agent', () => {
    expect(describeUserAgent(null)).toBeNull()
    expect(describeUserAgent('')).toBeNull()
    expect(describeUserAgent('curl/8.0')).toBeNull()
  })
})

describe('buildSignatureEvidence', () => {
  it('maps the row into the evidence the editor and the PDF show', () => {
    expect(buildSignatureEvidence(row())).toEqual({
      signerName: 'Jane Client',
      signerEmail: 'jane@example.com',
      signedAt: '2026-11-21T20:25:00Z',
      ipAddress: '203.0.113.9',
      device: 'Safari on iPhone',
      userAgent: row().user_agent,
      signedTotal: 1000,
      currencyCode: 'USD',
      sha256: sha,
      integrity: 'verified',
      consentStatement: 'By signing, you agree to the pricing and terms in this estimate.',
      signatureDataUrl: 'data:image/png;base64,AAA',
    })
  })

  it('a legacy signature (no snapshot, no hash) degrades without throwing', () => {
    const evidence = buildSignatureEvidence(row({ signed_content: null, snapshot_sha256: null, signed_total: null, user_agent: null }))
    expect(evidence.integrity).toBe('unavailable')
    expect(evidence.signedTotal).toBeNull()
    expect(evidence.device).toBeNull()
    expect(evidence.consentStatement).toBeNull()
    expect(evidence.currencyCode).toBe('USD')
  })
})
