import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Security-hardening S3 (audit finding A) — signature pre-check on content
 * deletion. deleteEstimateSection/deleteEstimateItem (lib/actions/estimate.ts)
 * previously had zero awareness of estimate_signatures: a signed estimate's
 * sections/items could be deleted directly through these actions with no
 * guard at all (a different bypass path than saveEstimate's freeze-on-sign
 * guard, TRUST-02). This test drives the new pre-check: a friendly error
 * before the delete is attempted whenever the parent estimate has a
 * signature, and normal delete + totals-recalculation behavior otherwise.
 *
 * Fix-pack F1 (finding #10): widened to the SAME two-part predicate
 * lib/actions/estimate-photo.ts's assertPhotoMutationAllowed uses —
 * isEstimateLocked({sent_at, client_response}) OR an existing
 * estimate_signatures row — so a sent-but-unsigned estimate (delivered, but
 * not yet responded to) can no longer have whole sections/items deleted
 * through these actions either. The error string now matches the photo
 * guard's exactly ("...locked; create a new version...", asserted via
 * /locked/i below, mirroring tests/unit/actions/estimate-photo-lock-guard.test.ts).
 *
 * Mocking style mirrors tests/unit/actions/estimate-lock-guard.test.ts.
 */

vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn().mockResolvedValue('co_1'),
}))

vi.mock('@/lib/demo/guard', () => ({
  assertWritable: vi.fn().mockResolvedValue(null),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/integrations/xphere/dispatch', () => ({
  dispatchXphereSync: vi.fn(),
}))

const fromImpl = vi.fn()

// Scenario state, reset per test.
let sectionEstimateIdRow: { estimate_id: string } | null = { estimate_id: 'est_1' }
let itemSectionIdRow: { section_id: string } | null = { section_id: 'sec_1' }
let signatureRows: Array<{ id: string }> = []
let sectionDeleteError: { code?: string } | null = null
let itemDeleteError: { code?: string } | null = null
let sectionDeleteAttempted = false
let itemDeleteAttempted = false

const RECALC_ESTIMATE_ROW = {
  discount_type: null,
  discount_value: 0,
  tax_rate: 0,
  deposit_type: 'none',
  deposit_value: null,
  project_id: 'proj_1',
  company_id: 'co_1',
}

// Fix-pack F1 (finding #10) — sent_at/client_response merged onto every
// 'estimates' single()-row response below: assertEstimateContentDeleteAllowed
// reads these two fields, and recalculateEstimateTotals's OWN 'estimates'
// query (unaffected by this fix, still selecting the RECALC_ESTIMATE_ROW
// fields) tolerates the extra keys fine since it only destructures what it
// needs. Defaults to "unsigned, not yet sent" (today's baseline behavior).
let estimateLockRow: { sent_at: string | null; client_response: string | null } = {
  sent_at: null,
  client_response: null,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u_1' } } }) },
    from: (t: string) => fromImpl(t),
  }),
}))

function configureSupabase() {
  sectionDeleteAttempted = false
  itemDeleteAttempted = false

  fromImpl.mockImplementation((table: string) => {
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'co_1',
                currency_code: 'usd',
                default_tax_rate: 0,
                default_payment_terms: null,
                default_warranty_terms: null,
                tax_config: null,
              },
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'estimate_signatures') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: signatureRows, error: null }),
          }),
        }),
      }
    }

    if (table === 'estimate_sections') {
      return {
        select: vi.fn().mockImplementation((cols: string) => {
          if (cols.includes('items:estimate_items')) {
            // recalculateEstimateTotals' sections-list query (no .single()).
            return { eq: vi.fn().mockResolvedValue({ data: [], error: null }) }
          }
          // deleteEstimateSection / deleteEstimateItem's estimate_id lookup.
          return {
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: sectionEstimateIdRow, error: null }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: vi.fn().mockImplementation(() => {
          sectionDeleteAttempted = true
          return { eq: vi.fn().mockResolvedValue({ error: sectionDeleteError }) }
        }),
      }
    }

    if (table === 'estimate_items') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: itemSectionIdRow, error: null }),
          }),
        }),
        delete: vi.fn().mockImplementation(() => {
          itemDeleteAttempted = true
          return { eq: vi.fn().mockResolvedValue({ error: itemDeleteError }) }
        }),
      }
    }

    if (table === 'estimates') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ...RECALC_ESTIMATE_ROW, ...estimateLockRow },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }

    if (table === 'projects') {
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    }

    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sectionEstimateIdRow = { estimate_id: 'est_1' }
  itemSectionIdRow = { section_id: 'sec_1' }
  signatureRows = []
  estimateLockRow = { sent_at: null, client_response: null }
  sectionDeleteError = null
  itemDeleteError = null
  configureSupabase()
})

describe('deleteEstimateSection — signature pre-check', () => {
  it('deletes normally and recalculates totals when the estimate is unsigned', async () => {
    const { deleteEstimateSection } = await import('@/lib/actions/estimate')

    const result = await deleteEstimateSection('sec_1')

    expect(result.error).toBeUndefined()
    expect(sectionDeleteAttempted).toBe(true)
  })

  it('rejects with a friendly error BEFORE deleting when the parent estimate has a signature', async () => {
    signatureRows = [{ id: 'sig_1' }]
    const { deleteEstimateSection } = await import('@/lib/actions/estimate')

    const result = await deleteEstimateSection('sec_1')

    expect(result.error).toMatch(/locked/i)
    expect(sectionDeleteAttempted).toBe(false)
  })

  // Fix-pack F1 (finding #10): a sent-but-unsigned estimate (delivered to the
  // client, no signature row yet) previously fell through this pre-check
  // entirely — only the signature branch above was guarded — even though
  // saveEstimate's own freeze-on-send guard already blocks the equivalent
  // content edit. Mirrors estimate-photo-lock-guard.test.ts's identical case.
  it('rejects with a friendly error BEFORE deleting when the parent estimate is sent but not yet responded to (no signature)', async () => {
    estimateLockRow = { sent_at: '2026-07-01T00:00:00.000Z', client_response: null }
    const { deleteEstimateSection } = await import('@/lib/actions/estimate')

    const result = await deleteEstimateSection('sec_1')

    expect(result.error).toMatch(/locked/i)
    expect(sectionDeleteAttempted).toBe(false)
  })
})

describe('deleteEstimateItem — signature pre-check', () => {
  it('deletes normally and recalculates totals when the estimate is unsigned', async () => {
    const { deleteEstimateItem } = await import('@/lib/actions/estimate')

    const result = await deleteEstimateItem('item_1')

    expect(result.error).toBeUndefined()
    expect(itemDeleteAttempted).toBe(true)
  })

  it('rejects with a friendly error BEFORE deleting when the parent estimate is sent but not yet responded to (no signature)', async () => {
    estimateLockRow = { sent_at: '2026-07-01T00:00:00.000Z', client_response: null }
    const { deleteEstimateItem } = await import('@/lib/actions/estimate')

    const result = await deleteEstimateItem('item_1')

    expect(result.error).toMatch(/locked/i)
    expect(itemDeleteAttempted).toBe(false)
  })

  it('rejects with a friendly error BEFORE deleting when the parent estimate has a signature', async () => {
    signatureRows = [{ id: 'sig_1' }]
    const { deleteEstimateItem } = await import('@/lib/actions/estimate')

    const result = await deleteEstimateItem('item_1')

    expect(result.error).toMatch(/locked/i)
    expect(itemDeleteAttempted).toBe(false)
  })
})
