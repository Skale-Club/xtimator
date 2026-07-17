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
 * Phase 165 Plan 01 update: saveEstimate persists everything through ONE
 * supabase.rpc('save_estimate_atomic', { p_header, p_sections, ... }) call
 * instead of separate `.from('estimates').update(...)` /
 * `.from('estimate_items').insert(...)` calls. This file now captures the
 * RPC's p_header/p_sections arguments instead of those per-table payloads —
 * same assertions, different capture point.
 *
 * Hand-computed golden: quantity 10 × unit_price 100, tax_rate 0.0875 →
 *   subtotal 1000, tax 87.5, total 1087.5.
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

// Captured RPC call arguments.
let lastRpcArgs: {
  p_header: Record<string, unknown>
  p_sections: Array<{ items: Array<Record<string, unknown>> }>
} | null = null

const fromImpl = vi.fn()
const rpcImpl = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u_1' } } }) },
    from: (t: string) => fromImpl(t),
    rpc: (fn: string, args: typeof lastRpcArgs) => rpcImpl(fn, args),
  }),
}))

function configureSupabase() {
  lastRpcArgs = null

  rpcImpl.mockImplementation((_fn: string, args: NonNullable<typeof lastRpcArgs>) => {
    lastRpcArgs = args
    return Promise.resolve({
      data: {
        updated_at: '2026-01-01T00:00:00.000Z',
        project_total: 1000,
        project_id: 'proj_1',
        previous_total: 1000,
        id_map: { 'temp-sec-1': 'sec_real_1', 'temp-item-1': 'item_real_1' },
      },
      error: null,
    })
  })

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

    if (table === 'estimate_activity') {
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }

    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getActiveCompanyId.mockResolvedValue('co_1')
  configureSupabase()
})

// A NEW section + NEW item (temp- ids) so the payload exercises the
// new-section/new-item shape.
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

describe('PUI-01: saveEstimate widened contract (persisted via save_estimate_atomic)', () => {
  it('Case A — GUARD-03: a wrong client-sent total/subtotal is ignored; server recompute wins', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    // Inject DELIBERATELY WRONG client totals (extra keys the contract may carry).
    const input = baseInput({
      estimate: { subtotal: 999999, total: 999999 },
    })

    const result = await saveEstimate(input as never)
    expect(result).not.toHaveProperty('error')

    // Server recompute: 10 × 100 = 1000 subtotal; tax 1000 × 0.0875 = 87.5; total 1087.5.
    expect(lastRpcArgs).not.toBeNull()
    expect(lastRpcArgs!.p_header.subtotal).toBe(1000)
    expect(lastRpcArgs!.p_header.tax_amount).toBe(87.5)
    expect(lastRpcArgs!.p_header.total).toBe(1087.5)
    // The wrong client number never wins.
    expect(lastRpcArgs!.p_header.total).not.toBe(999999)
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

    // p_sections[0].items[0] carries the five new columns.
    expect(lastRpcArgs).not.toBeNull()
    const itemPayload = lastRpcArgs!.p_sections[0].items[0]
    expect(itemPayload).toHaveProperty('taxable', false)
    expect(itemPayload).toHaveProperty('tax_category', 'labor')
    expect(itemPayload).toHaveProperty('discount', 25)
    expect(itemPayload).toHaveProperty('cost', 80)
    expect(itemPayload).toHaveProperty('markup_pct', 25)

    // p_header carries deposit_type/deposit_value/balance_due.
    expect(lastRpcArgs!.p_header).toHaveProperty('deposit_type', 'percent')
    expect(lastRpcArgs!.p_header).toHaveProperty('deposit_value', 50)
    expect(lastRpcArgs!.p_header).toHaveProperty('balance_due')
  })

  it('Case C — retrocompat: no new fields → byte-identical totals; deposit 0, balance_due === total', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    // No new per-item fields, discount_type null, no deposit.
    const input = baseInput()

    const result = await saveEstimate(input as never)
    expect(result).not.toHaveProperty('error')

    // Same numbers today's inline math produces: subtotal 1000, tax 87.5, total 1087.5.
    expect(lastRpcArgs).not.toBeNull()
    expect(lastRpcArgs!.p_header.subtotal).toBe(1000)
    expect(lastRpcArgs!.p_header.tax_amount).toBe(87.5)
    expect(lastRpcArgs!.p_header.total).toBe(1087.5)
    expect(lastRpcArgs!.p_header.discount_amount).toBe(0)
    // Deposit dormant: balance_due === total, deposit 0.
    expect(lastRpcArgs!.p_header.balance_due).toBe(1087.5)
  })

  it('Case D (165-01 new) — price_source is resolved in the action: isManuallyEdited true forces price_source null', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const input = baseInput({
      item: { price_source: 'ai_estimate', isManuallyEdited: true },
    })

    const result = await saveEstimate(input as never)
    expect(result).not.toHaveProperty('error')

    const itemPayload = lastRpcArgs!.p_sections[0].items[0]
    expect(itemPayload.price_source).toBeNull()
    // isManuallyEdited itself must NOT reach the RPC payload (Opus nit #5).
    expect(itemPayload).not.toHaveProperty('isManuallyEdited')
  })

  it('Case E (165-01 new) — id_map from the RPC result is returned to the caller', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(baseInput() as never)

    expect(result.data?.id_map).toEqual({
      'temp-sec-1': 'sec_real_1',
      'temp-item-1': 'item_real_1',
    })
  })
})
