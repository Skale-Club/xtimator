import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Pre-launch audit fix (B7) — saveEstimate optimistic-concurrency guard.
 *
 * Two tabs/sessions editing the SAME estimate: without this guard, whichever
 * save lands second silently overwrites the first (and DELETES any
 * section/item the first writer added that the second writer's stale payload
 * doesn't know about — see lib/actions/estimate.ts's orphan-delete steps).
 *
 * saveEstimate now scopes the estimates UPDATE to
 * `.eq('updated_at', expectedUpdatedAt)` when the caller supplies it (the
 * editor always does). This test proves:
 *   - a MATCHING expectedUpdatedAt saves normally and returns the new
 *     updated_at for the caller to use as its next baseline.
 *   - a STALE expectedUpdatedAt (someone else already saved) returns
 *     { error, conflict: true } and does NOT touch estimate_sections /
 *     estimate_items at all — the destructive orphan-delete steps never run.
 *   - omitting expectedUpdatedAt entirely (back-compat) skips the check.
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

const SERVER_UPDATED_AT = '2026-07-06T10:00:00.000Z'
const NEW_UPDATED_AT = '2026-07-06T10:05:00.000Z'

const fromImpl = vi.fn()
let sectionsAndItemsTouched = false

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u_1' } } }) },
    from: (t: string) => fromImpl(t),
  }),
}))

function configureSupabase() {
  sectionsAndItemsTouched = false

  fromImpl.mockImplementation((table: string) => {
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'co_1', currency_code: 'usd', default_tax_rate: 0.0875 },
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'estimates') {
      let sawUpdatedAtEq = false
      let matched = true

      const afterIdEq: {
        eq: ReturnType<typeof vi.fn>
        select: ReturnType<typeof vi.fn>
      } = {
        eq: vi.fn().mockImplementation((col: string, val: unknown) => {
          if (col === 'updated_at') {
            sawUpdatedAtEq = true
            matched = val === SERVER_UPDATED_AT
          }
          return afterIdEq
        }),
        select: vi.fn().mockImplementation(() => {
          if (sawUpdatedAtEq && !matched) {
            return Promise.resolve({ data: [], error: null })
          }
          return Promise.resolve({
            data: [{ id: 'est_1', updated_at: NEW_UPDATED_AT }],
            error: null,
          })
        }),
      }

      return {
        update: vi.fn().mockImplementation(() => {
          sawUpdatedAtEq = false
          matched = true
          return afterIdEq
        }),
        // Phase 164 Plan 02 (TRUST-02): saveEstimate now does a pre-UPDATE
        // SELECT of sent_at/client_response/total/project_id for the
        // freeze-on-send/sign guard (this file's fixture is always a draft —
        // both null — so the guard never fires here).
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

    // Phase 164 Plan 02 (TRUST-03): fire-and-forget estimate_updated activity
    // insert — wrapped in try/catch by the action, but stub it cleanly.
    if (table === 'estimate_activity') {
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
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

    if (table === 'projects') {
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    }

    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getActiveCompanyId.mockResolvedValue('co_1')
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
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('B7: saveEstimate optimistic-concurrency guard', () => {
  it('matching expectedUpdatedAt saves normally and returns the new updated_at', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(
      baseInput({ expectedUpdatedAt: SERVER_UPDATED_AT }) as never
    )

    expect(result.error).toBeUndefined()
    expect(result.data?.updated_at).toBe(NEW_UPDATED_AT)
    expect(sectionsAndItemsTouched).toBe(true)
  })

  it('stale expectedUpdatedAt returns a conflict and never touches sections/items', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(
      baseInput({ expectedUpdatedAt: 'some-stale-timestamp' }) as never
    )

    expect(result.error).toBeDefined()
    expect('conflict' in result && result.conflict).toBe(true)
    // The destructive orphan-delete steps live inside the sections/items loop —
    // proving that table was never reached is the core safety property here.
    expect(sectionsAndItemsTouched).toBe(false)
  })

  it('omitting expectedUpdatedAt entirely skips the check (back-compat)', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const input = baseInput()
    delete (input as { expectedUpdatedAt?: string }).expectedUpdatedAt

    const result = await saveEstimate(input as never)

    expect(result.error).toBeUndefined()
    expect(sectionsAndItemsTouched).toBe(true)
  })
})
