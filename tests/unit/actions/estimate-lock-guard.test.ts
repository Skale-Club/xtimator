import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * TRUST-02/03 (Phase 164 Plan 02) — saveEstimate's freeze-on-send/sign guard
 * + estimate_updated activity emission, and the presentation-settings
 * lock-exempt carve-out (savePresentationSettings).
 *
 * Lock coverage (Opus blocker #1 — the signed-but-unresponded window): a
 * locked estimate is rejected pre-write when EITHER
 * isEstimateLocked({sent_at, client_response}) is true OR an
 * estimate_signatures row exists. sign/route.ts inserts the signature
 * BEFORE calling respondToEstimate and SWALLOWS a respond failure, so a
 * signed estimate can still have sent_at and client_response both null —
 * isEstimateLocked() alone would miss it.
 */

const getActiveCompanyId = vi.fn()
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: (...args: unknown[]) => getActiveCompanyId(...args),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/integrations/xphere/dispatch', () => ({
  dispatchXphereSync: vi.fn(),
}))

const fromImpl = vi.fn()
let sectionsAndItemsTouched = false
let estimatesUpdated = false
let activityInsertPayload: Record<string, unknown> | null = null

let preUpdateRow: {
  sent_at: string | null
  client_response: string | null
  total: number | null
  project_id: string
} = {
  sent_at: null,
  client_response: null,
  total: 1000,
  project_id: 'proj_1',
}
let signatureRows: Array<{ id: string }> = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u_1' } } }) },
    from: (t: string) => fromImpl(t),
  }),
}))

function configureSupabase() {
  sectionsAndItemsTouched = false
  estimatesUpdated = false
  activityInsertPayload = null

  fromImpl.mockImplementation((table: string) => {
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'co_1', currency_code: 'usd', default_tax_rate: 0 },
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'estimates') {
      return {
        // The pre-UPDATE lock-check SELECT (sent_at, client_response, total, project_id).
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: preUpdateRow, error: null }),
          }),
        }),
        update: vi.fn().mockImplementation(() => {
          estimatesUpdated = true
          return {
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'est_1', updated_at: '2026-07-17T12:00:00.000Z' }],
                error: null,
              }),
            }),
          }
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

    if (table === 'estimate_sections' || table === 'estimate_items') {
      sectionsAndItemsTouched = true
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'real_1' }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        delete: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }

    if (table === 'estimate_activity') {
      return {
        insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          activityInsertPayload = payload
          return Promise.resolve({ error: null })
        }),
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
  getActiveCompanyId.mockResolvedValue('co_1')
  preUpdateRow = { sent_at: null, client_response: null, total: 1000, project_id: 'proj_1' }
  signatureRows = []
  configureSupabase()
})

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    id: 'est_1',
    summary: null,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    discount_type: null,
    discount_value: 0,
    tax_rate: 0,
    estimate_date: null,
    estimate_number: null,
    sections: [
      {
        id: 'temp-sec-1',
        title: 'General',
        sort_order: 0,
        items: [
          {
            id: 'temp-item-1',
            description: 'Labor',
            quantity: 10,
            unit: 'hr',
            unit_price: 100,
            sort_order: 0,
            price_source: null,
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('TRUST-02: saveEstimate freeze-on-send/sign guard', () => {
  it('rejects a save when sent_at is set — zero writes', async () => {
    preUpdateRow.sent_at = '2026-07-17T00:00:00.000Z'
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(baseInput() as never)

    expect(result.error).toBe('estimate_locked')
    expect(estimatesUpdated).toBe(false)
    expect(sectionsAndItemsTouched).toBe(false)
  })

  it('rejects a save when client_response is set — zero writes', async () => {
    preUpdateRow.client_response = 'accepted'
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(baseInput() as never)

    expect(result.error).toBe('estimate_locked')
    expect(estimatesUpdated).toBe(false)
    expect(sectionsAndItemsTouched).toBe(false)
  })

  it('rejects a save when a signature row exists even with sent_at AND client_response both null (signed-but-unresponded window)', async () => {
    signatureRows = [{ id: 'sig_1' }]
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(baseInput() as never)

    expect(result.error).toBe('estimate_locked')
    expect(estimatesUpdated).toBe(false)
    expect(sectionsAndItemsTouched).toBe(false)
  })

  it('a draft (no lock conditions) saves normally and emits an estimate_updated activity row', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(baseInput() as never)

    expect(result.error).toBeUndefined()
    expect(estimatesUpdated).toBe(true)
    expect(sectionsAndItemsTouched).toBe(true)

    // Fire-and-forget: flush microtasks so the un-awaited activity insert lands.
    await new Promise((r) => setTimeout(r, 0))
    expect(activityInsertPayload).not.toBeNull()
    expect(activityInsertPayload!.event_type).toBe('estimate_updated')
    expect(activityInsertPayload!.estimate_id).toBe('est_1')
  })
})

describe('TRUST-02: savePresentationSettings is lock-exempt', () => {
  it('updates presentation_settings on a LOCKED estimate (sent_at set) without the lock guard applying', async () => {
    // Would reject saveEstimate outright — must NOT affect this separate path.
    preUpdateRow.sent_at = '2026-07-17T00:00:00.000Z'
    const { savePresentationSettings } = await import('@/lib/actions/estimate')

    const result = await savePresentationSettings('est_1', { sections: { summary: false } })

    expect(result.error).toBeUndefined()
    expect(estimatesUpdated).toBe(true)
  })

  it('updates presentation_settings on a signature-locked estimate too', async () => {
    signatureRows = [{ id: 'sig_1' }]
    const { savePresentationSettings } = await import('@/lib/actions/estimate')

    const result = await savePresentationSettings('est_1', { discount: { enabled: false } })

    expect(result.error).toBeUndefined()
    expect(estimatesUpdated).toBe(true)
  })
})
