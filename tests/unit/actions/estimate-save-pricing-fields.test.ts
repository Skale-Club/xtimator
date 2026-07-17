import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * PUI-01 (server half) — saveEstimate must:
 *   A. GUARD-03: RECOMPUTE all totals server-side via computeEstimateTotals; a wrong
 *      client-sent total/subtotal must NEVER win (never-trust-client).
 *   B. ACCEPT + PERSIST the v4.11 advanced-pricing fields: per-item
 *      taxable/tax_category/discount/cost/markup_pct and estimate
 *      deposit_type/deposit_value (+ balance_due).
 *   C. RETROCOMPAT: an unedited estimate (no new fields, discount_type null, no deposit)
 *      saves the SAME subtotal/tax/total today's inline math produced; balance_due === total,
 *      deposit === 0.
 *
 * Behavioral test: mocks the supabase client chain, getActiveCompanyId, next/cache, and the
 * xphere dispatch. Captures the estimates UPDATE payload and the estimate_items INSERT payload.
 *
 * Hand-computed golden: quantity 10 × unit_price 100, tax_rate 0.0875 →
 *   subtotal 1000, tax 87.5, total 1087.5.
 *
 * RED until Task 2 widens the action (the new-field keys are absent from the captured payloads
 * and the inline math ignores the per-item fields).
 */

// --- Mocks -----------------------------------------------------------------

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

// Captured payloads
let estimatesUpdatePayload: Record<string, unknown> | null = null
const estimateItemsInsertPayloads: Array<Record<string, unknown>> = []
const estimateItemsUpdatePayloads: Array<Record<string, unknown>> = []

const fromImpl = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u_1' } } }) },
    from: (t: string) => fromImpl(t),
  }),
}))

function configureSupabase() {
  estimatesUpdatePayload = null
  estimateItemsInsertPayloads.length = 0
  estimateItemsUpdatePayloads.length = 0

  fromImpl.mockImplementation((table: string) => {
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'co_1',
                currency_code: 'usd',
                default_tax_rate: 0.0875,
                default_payment_terms: null,
                default_warranty_terms: null,
              },
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'estimates') {
      return {
        update: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          // The first .update on estimates is the totals write (carries subtotal/total).
          if ('subtotal' in payload || 'total' in payload) {
            estimatesUpdatePayload = payload
          }
          // Pre-launch audit fix (B7): saveEstimate now chains .select() after
          // .eq() to read back the row (optimistic-concurrency check + the
          // new updated_at returned to the caller).
          return {
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'est_1', updated_at: '2026-01-01T00:00:00.000Z' }],
                error: null,
              }),
            }),
          }
        }),
        // Phase 164 Plan 02 (TRUST-02): saveEstimate now does a pre-UPDATE
        // SELECT of sent_at/client_response/total/project_id for the
        // freeze-on-send/sign guard (this fixture is always a draft — both
        // null — so the guard never fires here).
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { sent_at: null, client_response: null, total: 1000, project_id: 'proj_1' },
              error: null,
            }),
          }),
        }),
      }
    }

    // Phase 164 Plan 02 (TRUST-02): signature-existence lookup — no signature
    // by default, so the freeze-on-send/sign guard never fires in this file.
    if (table === 'estimate_signatures') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }
    }

    // Phase 164 Plan 02 (TRUST-03): fire-and-forget estimate_updated activity insert.
    if (table === 'estimate_activity') {
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }

    if (table === 'estimate_sections') {
      return {
        // new-section insert path
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'sec_real_1' }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [{ id: 'sec_real_1' }], error: null }),
        }),
        delete: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }

    if (table === 'estimate_items') {
      return {
        insert: vi.fn().mockImplementation((rows: unknown) => {
          const arr = Array.isArray(rows) ? rows : [rows]
          for (const r of arr) estimateItemsInsertPayloads.push(r as Record<string, unknown>)
          // new-section bulk insert returns nothing chainable; new-item insert needs .select().single()
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'item_real_1' }, error: null }),
            }),
            // allow `await insert(rows)` (bulk insert) to resolve directly
            then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
          }
        }),
        update: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          estimateItemsUpdatePayloads.push(payload)
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        delete: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }

    if (table === 'projects') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getActiveCompanyId.mockResolvedValue('co_1')
  configureSupabase()
})

// A NEW section + NEW item (temp- ids) so the action takes the insert path and we capture the
// estimate_items insert payload.
function baseInput(overrides: {
  item?: Record<string, unknown>
  estimate?: Record<string, unknown>
} = {}) {
  return {
    id: 'est_1',
    summary: null,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    discount_type: null,
    discount_value: 0,
    tax_rate: 0.0875,
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
            ...(overrides.item ?? {}),
          },
        ],
      },
    ],
    ...(overrides.estimate ?? {}),
  }
}

describe('PUI-01: saveEstimate widened contract', () => {
  it('Case A — GUARD-03: a wrong client-sent total/subtotal is ignored; server recompute wins', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    // Inject DELIBERATELY WRONG client totals (extra keys the contract may carry).
    const input = baseInput({
      estimate: { subtotal: 999999, total: 999999 },
    })

    const result = await saveEstimate(input as never)
    expect(result).not.toHaveProperty('error')

    // Server recompute: 10 × 100 = 1000 subtotal; tax 1000 × 0.0875 = 87.5; total 1087.5.
    expect(estimatesUpdatePayload).not.toBeNull()
    expect(estimatesUpdatePayload!.subtotal).toBe(1000)
    expect(estimatesUpdatePayload!.tax_amount).toBe(87.5)
    expect(estimatesUpdatePayload!.total).toBe(1087.5)
    // The wrong client number never wins.
    expect(estimatesUpdatePayload!.total).not.toBe(999999)
  })

  it('Case B — new per-item + deposit fields are accepted and persisted', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const input = baseInput({
      item: {
        taxable: false,
        discount: 25,
        tax_category: 'labor',
        cost: 80,
        markup_pct: 25,
      },
      estimate: { deposit_type: 'percent', deposit_value: 50 },
    })

    const result = await saveEstimate(input as never)
    expect(result).not.toHaveProperty('error')

    // estimate_items insert payload carries the five new columns.
    expect(estimateItemsInsertPayloads.length).toBeGreaterThan(0)
    const itemPayload = estimateItemsInsertPayloads[0]
    expect(itemPayload).toHaveProperty('taxable', false)
    expect(itemPayload).toHaveProperty('tax_category', 'labor')
    expect(itemPayload).toHaveProperty('discount', 25)
    expect(itemPayload).toHaveProperty('cost', 80)
    expect(itemPayload).toHaveProperty('markup_pct', 25)

    // estimates update payload carries deposit_type/deposit_value/balance_due.
    expect(estimatesUpdatePayload).not.toBeNull()
    expect(estimatesUpdatePayload).toHaveProperty('deposit_type', 'percent')
    expect(estimatesUpdatePayload).toHaveProperty('deposit_value', 50)
    expect(estimatesUpdatePayload).toHaveProperty('balance_due')
  })

  it('Case C — retrocompat: no new fields → byte-identical totals; deposit 0, balance_due === total', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    // No new per-item fields, discount_type null, no deposit.
    const input = baseInput()

    const result = await saveEstimate(input as never)
    expect(result).not.toHaveProperty('error')

    // Same numbers today's inline math produces: subtotal 1000, tax 87.5, total 1087.5.
    expect(estimatesUpdatePayload).not.toBeNull()
    expect(estimatesUpdatePayload!.subtotal).toBe(1000)
    expect(estimatesUpdatePayload!.tax_amount).toBe(87.5)
    expect(estimatesUpdatePayload!.total).toBe(1087.5)
    expect(estimatesUpdatePayload!.discount_amount).toBe(0)
    // Deposit dormant: balance_due === total, deposit 0.
    expect(estimatesUpdatePayload!.balance_due).toBe(1087.5)
  })
})
