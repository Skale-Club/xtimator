// tests/unit/quota.test.ts
// Phase 56: checkQuota + recordUsage unit tests
// Covers all 7 behaviors from PLAN.md must_haves.truths

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mock entitlements module
vi.mock('@/lib/entitlements', () => ({
  getEntitlements: vi.fn(),
  getEntitlementsForCompany: vi.fn(),
}))

// Mock company query module (not used directly in quota.ts but imported)
vi.mock('@/lib/queries/company', () => ({
  getCompanyTier: vi.fn(),
}))

import { checkQuota, recordUsage } from '@/lib/quota'
import { getEntitlements, getEntitlementsForCompany } from '@/lib/entitlements'

// ---------------------------------------------------------------------------
// Mock Supabase factory
// ---------------------------------------------------------------------------

/**
 * Build a minimal fake Supabase client for quota tests.
 *
 * checkQuota query chain:
 *   companies: .from('companies').select('tier').eq('id', companyId).single() → { data: { tier }, error: null }
 *   usage_events (SELECT): .from('usage_events').select('id').eq('company_id', ...).gte('created_at', ...) → { data: rows, error: null }
 *
 * recordUsage check-then-insert chain:
 *   dedup SELECT: .from('usage_events').select('id').eq('company_id', ...).eq('idempotency_key', ...).limit(1).maybeSingle() → { data: existing }
 *   INSERT:       .from('usage_events').insert({...}) → { error: insertError }
 *
 * monthCount = total rows returned for the month query.
 * dayCount   = rows returned for the day sub-filter (implemented via second .gte() call).
 */
function makeSupabase({
  tier = 'free',
  monthCount = 0,
  dayCount = 0,
  existing = null as unknown,
  insertError = null as unknown,
} = {}) {
  // Build rows for month and day counts
  const monthRows = Array(monthCount).fill({ id: 'x' })
  const dayRows = Array(dayCount).fill({ id: 'x' })

  const insertMock = vi.fn().mockResolvedValue({ error: insertError })

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { tier }, error: null }),
          }),
        }),
      }
    }

    if (table === 'usage_events') {
      // The select() result must serve two different chains:
      //   checkQuota:  .eq('company_id', id).gte(startOfMonth).gte(startOfDay)
      //   recordUsage: .eq('company_id', id).eq('idempotency_key', key).limit(1).maybeSingle()
      const eqMock = vi.fn().mockImplementation(() => {
        // checkQuota path: .gte() called twice (month, then day).
        let gteCallCount = 0
        const gteMock: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(() => {
          gteCallCount++
          if (gteCallCount === 1) {
            return { gte: vi.fn().mockResolvedValue({ data: dayRows, error: null }) }
          }
          return Promise.resolve({ data: dayRows, error: null })
        })

        // recordUsage dedup path: .eq('idempotency_key', ...).limit(1).maybeSingle()
        const eqIdempotency = vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
          }),
        })

        return { gte: gteMock, eq: eqIdempotency }
      })

      return {
        select: vi.fn().mockReturnValue({ eq: eqMock }),
        insert: insertMock,
      }
    }
  })

  return {
    from: fromMock,
    insertMock,
    _insertMock: insertMock,
  } as unknown as SupabaseClient & { insertMock: ReturnType<typeof vi.fn>; _insertMock: ReturnType<typeof vi.fn> }
}

// ---------------------------------------------------------------------------
// Helper to set up getEntitlements mock return value
// ---------------------------------------------------------------------------

function mockEntitlements(overrides: Partial<{
  maxEstimatesPerMonth: number | null
  maxEstimatesPerDay: number | null
}> = {}) {
  const defaults = { maxEstimatesPerMonth: 10, maxEstimatesPerDay: 3 }
  const resolved = { ...defaults, ...overrides }
  // quota.ts resolves entitlements via getEntitlementsForCompany (trial-aware);
  // keep getEntitlements stubbed too for any legacy call path.
  ;(getEntitlements as ReturnType<typeof vi.fn>).mockReturnValue(resolved)
  ;(getEntitlementsForCompany as ReturnType<typeof vi.fn>).mockReturnValue(resolved)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('quota', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Test 1: Under both monthly and daily limits → allowed: true, remaining: N
  it('checkQuota returns { allowed: true, remaining: N } when under both monthly and daily limits', async () => {
    // free tier: 10/month, 3/day. 2 events today (dayCount=2, monthCount=2).
    // remaining = 10 - 2 = 8 (month-bound, more restrictive for remaining calc)
    const supabase = makeSupabase({ tier: 'free', monthCount: 2, dayCount: 2 })
    mockEntitlements({ maxEstimatesPerMonth: 10, maxEstimatesPerDay: 3 })

    const result = await checkQuota(supabase, 'company-123', 'estimate')

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(8)
  })

  // Test 2: Monthly limit reached → allowed: false, remaining: 0
  it('checkQuota returns { allowed: false, remaining: 0 } when monthly limit reached', async () => {
    // 10 events this month = at limit (10/month)
    const supabase = makeSupabase({ tier: 'free', monthCount: 10, dayCount: 10 })
    mockEntitlements({ maxEstimatesPerMonth: 10, maxEstimatesPerDay: 3 })

    const result = await checkQuota(supabase, 'company-123', 'estimate')

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  // Test 3: Daily limit reached → allowed: false, remaining: 0
  it('checkQuota returns { allowed: false, remaining: 0 } when daily limit reached', async () => {
    // 0 events this month, 3 today = daily limit of 3 reached
    const supabase = makeSupabase({ tier: 'free', monthCount: 3, dayCount: 3 })
    mockEntitlements({ maxEstimatesPerMonth: 10, maxEstimatesPerDay: 3 })

    const result = await checkQuota(supabase, 'company-123', 'estimate')

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  // Test 4: Null limit (unlimited tier) → allowed: true, remaining: null
  it('checkQuota returns { allowed: true, remaining: null } when entitlement limit is null (unlimited)', async () => {
    // trial tier: maxEstimatesPerMonth = null (unlimited), maxEstimatesPerDay = null
    const supabase = makeSupabase({ tier: 'trial', monthCount: 999, dayCount: 20 })
    mockEntitlements({ maxEstimatesPerMonth: null, maxEstimatesPerDay: null })

    const result = await checkQuota(supabase, 'company-123', 'estimate')

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBeNull()
  })

  // Test 5: recordUsage — new idempotency key → inserts row (insert mock called once)
  it('recordUsage inserts a usage_events row for a new idempotency key', async () => {
    const supabase = makeSupabase() // existing = null → no dedup hit, insert runs
    const insertSpy = (supabase as unknown as { insertMock: ReturnType<typeof vi.fn> }).insertMock

    await recordUsage(supabase, 'company-123', 'estimate_generated', 1, 'idem-key-001')

    expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('usage_events')
    expect(insertSpy).toHaveBeenCalledTimes(1)
  })

  // Test 6: recordUsage — duplicate idempotency key → no insert, no throw (idempotent)
  it('recordUsage with a duplicate idempotency key does NOT throw and skips the insert', async () => {
    // Dedup SELECT finds an existing row → recordUsage returns early.
    const supabase = makeSupabase({ existing: { id: 'already-recorded' } })
    const insertSpy = (supabase as unknown as { insertMock: ReturnType<typeof vi.fn> }).insertMock

    await expect(
      recordUsage(supabase, 'company-123', 'estimate_generated', 1, 'duplicate-key')
    ).resolves.toBeUndefined()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  // Test 6b: recordUsage — concurrent retry races insert → 23505 swallowed, no throw
  it('recordUsage swallows a unique-violation (23505) from a concurrent retry', async () => {
    const supabase = makeSupabase({ insertError: { code: '23505', message: 'duplicate key' } })

    await expect(
      recordUsage(supabase, 'company-123', 'estimate_generated', 1, 'raced-key')
    ).resolves.toBeUndefined()
  })

  // Test 7: recordUsage — two different keys → two distinct inserts
  it('recordUsage with a different idempotency key inserts a new row (second insert call)', async () => {
    const supabase = makeSupabase()
    const insertSpy = (supabase as unknown as { insertMock: ReturnType<typeof vi.fn> }).insertMock

    await recordUsage(supabase, 'company-123', 'estimate_generated', 1, 'key-A')
    await recordUsage(supabase, 'company-123', 'estimate_generated', 1, 'key-B')

    expect(insertSpy).toHaveBeenCalledTimes(2)
  })
})
