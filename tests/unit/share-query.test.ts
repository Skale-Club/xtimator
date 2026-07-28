import { describe, expect, it, vi, beforeEach } from 'vitest'

const { serviceClientMock } = vi.hoisted(() => ({ serviceClientMock: { from: vi.fn() } }))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => serviceClientMock,
}))

import { getEstimateByShareToken, getShareLinkState } from '@/lib/queries/share'

type AnyRow = Record<string, unknown>

interface MockConfig {
  estimateRow?: AnyRow | null
  sections?: AnyRow[]
  projectRow?: AnyRow | null
  companyRow?: AnyRow | null
  stateRow?: AnyRow | null
  /** TRUST-01 — latest estimate_signatures row (id, signed_at, signed_content,
   *  signed_total). Undefined/null = no signature yet (today's behavior). */
  signatureRow?: AnyRow | null
}

// Captures the column lists passed to .select() per table for assertions.
const selectCols: Record<string, string> = {}

function installMock(cfg: MockConfig) {
  selectCols.companies = ''
  serviceClientMock.from.mockImplementation((table: string) => {
    if (table === 'estimates') {
      return {
        select: vi.fn((cols: string) => {
          selectCols.estimates = cols
          return {
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: cfg.estimateRow ?? null }),
              maybeSingle: vi.fn().mockResolvedValue({ data: cfg.stateRow ?? null }),
            })),
          }
        }),
      }
    }
    if (table === 'estimate_sections') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: cfg.sections ?? [] }) })),
        })),
      }
    }
    if (table === 'estimate_items') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [] }) })),
        })),
      }
    }
    if (table === 'projects') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: cfg.projectRow ?? null }) })),
        })),
      }
    }
    if (table === 'companies') {
      return {
        select: vi.fn((cols: string) => {
          selectCols.companies = cols
          return {
            eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: cfg.companyRow ?? null }) })),
          }
        }),
      }
    }
    if (table === 'estimate_photos') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [] }) })),
        })),
      }
    }
    if (table === 'estimate_signatures') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: cfg.signatureRow ?? null }),
              })),
            })),
          })),
        })),
      }
    }
    return { select: vi.fn() }
  })
}

const validEstimate: AnyRow = {
  id: 'e1',
  project_id: 'p1',
  company_id: 'c1',
  total: 100,
  currency_code: 'USD',
  summary: 'Job summary',
  share_token: 'tok-SECRET',
  share_expires_at: null,
  payment_status: 'unpaid',
}

const validProject: AnyRow = {
  name: 'Kitchen Remodel',
  project_type: null,
  client: { name: 'Client', email: 'client@x.co', phone: '+15550001111', address: null, city: null, state: null, zip: null },
}

const validCompany: AnyRow = {
  id: 'c1', name: 'Co', owner_name: 'Owner', phone: '+15552223333', email: 'co@x.co',
  website: null, address: null, city: null, state: null, zip: null, logo_url: null,
  brand_primary_color: null, stripe_account_id: null, stripe_connect_status: null,
  digital_signature_enabled: false, estimate_terms_enabled: false, estimate_terms_text: null,
}

describe('getEstimateByShareToken', () => {
  beforeEach(() => vi.clearAllMocks())

  it('strips internal fields (share_token) from the returned estimate', async () => {
    installMock({ estimateRow: { ...validEstimate }, sections: [], projectRow: validProject, companyRow: validCompany })
    const result = await getEstimateByShareToken('tok-SECRET')

    expect(result).not.toBeNull()
    expect('share_token' in result!.estimate).toBe(false)
    // Fields the document needs are preserved
    expect(result!.estimate.id).toBe('e1')
    expect(result!.estimate.summary).toBe('Job summary')
  })

  it('does NOT over-fetch internal company prefs (notify_on_*) into the public payload', async () => {
    installMock({ estimateRow: { ...validEstimate }, sections: [], projectRow: validProject, companyRow: validCompany })
    await getEstimateByShareToken('tok-SECRET')
    expect(selectCols.companies).not.toContain('notify_on')
  })

  it('returns null for an EXPIRED link (serves no PII)', async () => {
    const past = new Date(Date.now() - 1000).toISOString()
    installMock({ estimateRow: { ...validEstimate, share_expires_at: past }, sections: [], projectRow: validProject, companyRow: validCompany })
    const result = await getEstimateByShareToken('tok-SECRET')
    expect(result).toBeNull()
  })

  it('returns data for a link expiring in the future', async () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    installMock({ estimateRow: { ...validEstimate, share_expires_at: future }, sections: [], projectRow: validProject, companyRow: validCompany })
    const result = await getEstimateByShareToken('tok-SECRET')
    expect(result).not.toBeNull()
  })

  it('returns null when the token is unknown', async () => {
    installMock({ estimateRow: null })
    const result = await getEstimateByShareToken('nope')
    expect(result).toBeNull()
  })
})

// PDFPAR-02 (Phase 183 Plan 02) — widened loadLatestSignedSnapshot now also
// surfaces signer_name/signature_data, threaded through as
// signerName/signedAt/signatureImageDataUrl on the returned estimate.
describe('getEstimateByShareToken — PDFPAR-02 signature display fields', () => {
  beforeEach(() => vi.clearAllMocks())

  it('signature present: signerName/signedAt/signatureImageDataUrl reflect the signature row', async () => {
    installMock({
      estimateRow: { ...validEstimate },
      sections: [],
      projectRow: validProject,
      companyRow: validCompany,
      signatureRow: {
        id: 'sig-1',
        signer_name: 'Jane Client',
        signature_data: 'data:image/png;base64,AAA',
        signed_at: '2026-07-01T12:00:00Z',
        signed_content: null,
        signed_total: null,
      },
    })

    const result = await getEstimateByShareToken('tok-SECRET')
    expect(result).not.toBeNull()
    expect(result!.estimate.signerName).toBe('Jane Client')
    expect(result!.estimate.signatureImageDataUrl).toBe('data:image/png;base64,AAA')
    expect(result!.estimate.signedAt).toBe('2026-07-01T12:00:00Z')
  })

  it('no signature: signerName/signedAt/signatureImageDataUrl are all null', async () => {
    installMock({
      estimateRow: { ...validEstimate },
      sections: [],
      projectRow: validProject,
      companyRow: validCompany,
      signatureRow: null,
    })

    const result = await getEstimateByShareToken('tok-SECRET')
    expect(result).not.toBeNull()
    expect(result!.estimate.signerName).toBeNull()
    expect(result!.estimate.signedAt).toBeNull()
    expect(result!.estimate.signatureImageDataUrl).toBeNull()
  })
})

// TRUST-01 (Phase 164 Plan 01) — audit finding A1/A2: "client signs $12,400 ->
// owner edits to $15,000 -> public link re-renders live rows ($15,000)". These
// tests prove the exact scenario the audit traced is now closed: once a
// signature with a non-null snapshot exists, live-row drift after signing
// does NOT reach the share payload — per-field, not just "totals happen to
// match".
describe('getEstimateByShareToken — TRUST-01 signed-snapshot overlay', () => {
  beforeEach(() => vi.clearAllMocks())

  // "Live" rows AS IF the owner edited the estimate after the client signed —
  // every drift-prone field is deliberately different from the signed snapshot.
  const liveEstimateAfterEdit: AnyRow = {
    id: 'e1',
    project_id: 'p1',
    company_id: 'c1',
    total: 15000,
    currency_code: 'USD',
    summary: 'EDITED summary after signing',
    share_token: 'tok-SECRET',
    share_expires_at: null,
    payment_status: 'unpaid',
    deposit_type: 'amount',
    deposit_value: 5000,
    balance_due: 10000,
    discount_type: 'fixed',
    discount_value: 500,
    discount_amount: 500,
    estimate_date: '2026-08-01',
    estimate_number: 'EST-9999',
    tax_rate: 0.08,
    tax_amount: 1000,
    subtotal: 14000,
  }

  const liveSectionsAfterEdit: AnyRow[] = [
    { id: 'sec-1', estimate_id: 'e1', company_id: 'c1', title: 'Edited Section', sort_order: 1, subtotal: 14000 },
  ]

  // What was actually signed — frozen forever, regardless of the live edit above.
  const signedSnapshot = {
    version: 1 as const,
    summary: 'ORIGINAL signed summary',
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    estimate_date: '2026-07-01',
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
    presentation_settings: null,
    sections: [
      { id: 'sec-1', title: 'Original Section', sort_order: 1, subtotal: 8000, items: [] },
    ],
  }

  const signatureRowWithSnapshot: AnyRow = {
    id: 'sig-1',
    signed_at: '2026-07-01T12:00:00Z',
    signed_content: signedSnapshot,
    signed_total: 9825,
  }

  it('snapshot present: every drift-prone field reflects the SIGNED value, not the live-edited one', async () => {
    installMock({
      estimateRow: liveEstimateAfterEdit,
      sections: liveSectionsAfterEdit,
      projectRow: validProject,
      companyRow: validCompany,
      signatureRow: signatureRowWithSnapshot,
    })

    const result = await getEstimateByShareToken('tok-SECRET')
    expect(result).not.toBeNull()
    const { estimate } = result!

    // Content fields
    expect(estimate.summary).toBe('ORIGINAL signed summary')
    expect(estimate.estimate_date).toBe('2026-07-01')
    expect(estimate.estimate_number).toBe('EST-1042')

    // Deposit
    expect(estimate.deposit_type).toBe('percent')
    expect(estimate.deposit_value).toBe(30)

    // Discount
    expect(estimate.discount_type).toBe('percentage')
    expect(estimate.discount_value).toBe(10)

    // Section subtotal (GUARD-03 — frozen, never recomputed)
    expect(estimate.sections).toHaveLength(1)
    expect(estimate.sections[0].subtotal).toBe(8000)
    expect(estimate.sections[0].title).toBe('Original Section')

    // total_amount_cents re-derived from signed_total (9825 -> 982500), NOT
    // from the live (edited) estimate.total (15000 -> 1500000).
    expect(estimate.total_amount_cents).toBe(982500)
    expect(estimate.total_amount_cents).not.toBe(1500000)
  })

  it('legacy signature (signed_content IS NULL) renders LIVE rows unchanged — byte-identical retrocompat', async () => {
    installMock({
      estimateRow: liveEstimateAfterEdit,
      sections: liveSectionsAfterEdit,
      projectRow: validProject,
      companyRow: validCompany,
      signatureRow: {
        id: 'sig-legacy',
        signed_at: '2026-05-19T00:00:00Z',
        signed_content: null,
        signed_total: null,
      },
    })

    const result = await getEstimateByShareToken('tok-SECRET')
    expect(result).not.toBeNull()
    const { estimate } = result!

    expect(estimate.summary).toBe('EDITED summary after signing')
    expect(estimate.estimate_date).toBe('2026-08-01')
    expect(estimate.estimate_number).toBe('EST-9999')
    expect(estimate.deposit_type).toBe('amount')
    expect(estimate.deposit_value).toBe(5000)
    expect(estimate.discount_type).toBe('fixed')
    expect(estimate.discount_value).toBe(500)
    expect(estimate.sections[0].subtotal).toBe(14000)
    // total_amount_cents keys off the LIVE total (15000 -> 1500000) — no signature snapshot to prefer.
    expect(estimate.total_amount_cents).toBe(1500000)
  })

  it('no signature at all: renders LIVE rows unchanged (today\'s behavior, no query result at all)', async () => {
    installMock({
      estimateRow: liveEstimateAfterEdit,
      sections: liveSectionsAfterEdit,
      projectRow: validProject,
      companyRow: validCompany,
      signatureRow: null,
    })

    const result = await getEstimateByShareToken('tok-SECRET')
    expect(result).not.toBeNull()
    expect(result!.estimate.summary).toBe('EDITED summary after signing')
    expect(result!.estimate.total_amount_cents).toBe(1500000)
  })
})

describe('getShareLinkState', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns "missing" for an unknown token', async () => {
    installMock({ stateRow: null })
    expect(await getShareLinkState('nope')).toBe('missing')
  })

  it('returns "expired" when share_expires_at is in the past', async () => {
    installMock({ stateRow: { share_expires_at: new Date(Date.now() - 1000).toISOString() } })
    expect(await getShareLinkState('tok')).toBe('expired')
  })

  it('returns "active" when not expired (or null expiry)', async () => {
    installMock({ stateRow: { share_expires_at: null } })
    expect(await getShareLinkState('tok')).toBe('active')
  })
})
