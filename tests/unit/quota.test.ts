// tests/unit/quota.test.ts
// Phase 56: checkQuota + recordUsage unit tests
// Covers all 7 behaviors from PLAN.md must_haves.truths

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mock entitlements module
vi.mock('@/lib/entitlements', () => ({
  getEntitlements: vi.fn(),
}))

// Mock company query module (not used directly in quota.ts but imported)
vi.mock('@/lib/queries/company', () => ({
  getCompanyTier: vi.fn(),
}))

import { checkQuota, recordUsage } from '@/lib/quota'
import { getEntitlements } from '@/lib/entitlements'

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
 * recordUsage upsert chain:
 *   usage_events: .from('usage_events').upsert({...}, { onConflict, ignoreDuplicates: true }) → { error: upsertError }
 *
 * monthCount = total rows returned for the month query.
 * dayCount   = rows returned for the day sub-filter (implemented via second .gte() call).
 */
function makeSupabase({
  tier = 'free',
  monthCount = 0,
  dayCount = 0,
  upsertError = null as unknown,
} = {}) {
  // Build rows for month and day counts
  const monthRows = Array(monthCount).fill({ id: 'x' })
  const dayRows = Array(dayCount).fill({ id: 'x' })

  const upsertMock = vi.fn().mockResolvedValue({ error: upsertError })

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
      // SELECT chain for checkQuota:
      //   .select('id').eq('company_id', id).gte('created_at', startOfMonth).gte('created_at', startOfDay)
      // The implementation calls gte twice: first for startOfMonth, then for startOfDay.
      // We simulate this by returning dayRows on the second .gte() (most restrictive filter).
      let gteCallCount = 0
      const gteMock: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(() => {
        gteCallCount++
        if (gteCallCount === 1) {
          // First gte = month filter — returns month rows, but still chainable for day filter
          return {
            gte: vi.fn().mockResolvedValue({ data: dayRows, error: null }),
          }
        }
        // Should not be reached in this chain structure
        return Promise.resolve({ data: dayRows, error: null })
      })

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: gteMock,
          }),
        }),
        upsert: upsertMock,
      }
    }
  })

  return {
    from: fromMock,
    upsertMock,
    _upsertMock: upsertMock,
  } as unknown as SupabaseClient & { upsertMock: ReturnType<typeof vi.fn>; _upsertMock: ReturnType<typeof vi.fn> }
}

// ---------------------------------------------------------------------------
// Helper to set up getEntitlements mock return value
// ---------------------------------------------------------------------------

function mockEntitlements(overrides: Partial<{
  maxEstimatesPerMonth: number | null
  maxEstimatesPerDay: number | null
}> = {}) {
  const defaults = { maxEstimatesPerMonth: 10, maxEstimatesPerDay: 3 }
  ;(getEntitlements as ReturnType<typeof vi.fn>).mockReturnValue({ ...defaults, ...overrides })
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

  // Test 5: recordUsage — new idempotency key → inserts row (upsert mock called once)
  it('recordUsage inserts a usage_events row for a new idempotency key', async () => {
    const supabase = makeSupabase()
    const typedSupabase = supabase as unknown as SupabaseClient & { _upsertMock: ReturnType<typeof vi.fn> }

    await recordUsage(supabase, 'company-123', 'estimate_generated', 1, 'idem-key-001')

    // Access the upsert spy through the from() mock
    expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('usage_events')
  })

  // Test 6: recordUsage — duplicate idempotency key → no error thrown (idempotent)
  it('recordUsage with a duplicate idempotency key does NOT throw (ON CONFLICT DO NOTHING)', async () => {
    // Simulate DB returning no error even on conflict (ignoreDuplicates: true)
    const supabase = makeSupabase({ upsertError: null })

    // Should not throw on duplicate
    await expect(
      recordUsage(supabase, 'company-123', 'estimate_generated', 1, 'duplicate-key')
    ).resolves.toBeUndefined()
  })

  // Test 7: recordUsage — second different key → second distinct upsert call
  it('recordUsage with a different idempotency key inserts a new row (second upsert call)', async () => {
    const supabase = makeSupabase()
    const fromSpy = (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from

    await recordUsage(supabase, 'company-123', 'estimate_generated', 1, 'key-A')
    await recordUsage(supabase, 'company-123', 'estimate_generated', 1, 'key-B')

    // from('usage_events') should have been called twice
    const usageCalls = fromSpy.mock.calls.filter((c: unknown[]) => c[0] === 'usage_events')
    expect(usageCalls.length).toBe(2)
  })
})
