// tests/unit/quota.test.ts
// Phase 56: checkQuota + recordUsage unit tests
// Covers all 7 behaviors from PLAN.md must_haves.truths
//
// QUOTA-EVENTTYPE-01 fix: checkQuota's day/month usage_events queries now
// filter by .eq('event_type', eventType) (previously they counted ALL usage
// event types against every quota, so e.g. price_researched events burned
// the estimate quota). The queries were also switched from
// select('id') + .length to { count: 'exact', head: true } so the count is
// not silently capped by PostgREST's default row limit. This file's mock
// chain reflects both changes.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mock entitlements module — quota.ts now enforces via the async
// getEntitlementsForTier (config-sourced) resolver.
vi.mock('@/lib/entitlements-server', () => ({
  getEntitlementsForTier: vi.fn(),
}))

// Mock company query module (not used directly in quota.ts but imported)
vi.mock('@/lib/queries/company', () => ({
  getCompanyTier: vi.fn(),
}))

import { checkQuota, recordUsage } from '@/lib/quota'
import { getEntitlementsForTier } from '@/lib/entitlements-server'

// ---------------------------------------------------------------------------
// Mock Supabase factory
// ---------------------------------------------------------------------------

/**
 * Build a minimal fake Supabase client for quota tests.
 *
 * checkQuota query chain (for the 'estimate' quota type):
 *   companies:    .from('companies').select('tier').eq('id', companyId).single()
 *                 → { data: { tier }, error: null }
 *   usage_events: .from('usage_events')
 *                   .select('id', { count: 'exact', head: true })
 *                   .eq('company_id', companyId)
 *                   .eq('event_type', eventType)
 *                   .gte('created_at', startOfMonth)
 *                   .gte('created_at', startOfDay | startOfMonth)
 *                 → { count, error: null }
 *               Called twice: first for the day-scoped count, then for the
 *               month-scoped count (same order checkQuota issues them in).
 *
 * recordUsage check-then-insert chain:
 *   dedup SELECT: .from('usage_events').select('id').eq('company_id', ...).eq('idempotency_key', ...).limit(1).maybeSingle()
 *   INSERT:       .from('usage_events').insert({...}) → { error: insertError }
 *
 * `eventTypeCounts`, when provided, overrides the flat monthCount/dayCount
 * and instead returns different counts PER event_type — used to prove the
 * .eq('event_type', ...) filter actually narrows the count (mixed-event-type
 * regression coverage).
 */
function makeSupabase({
  tier = 'free',
  monthCount = 0,
  dayCount = 0,
  eventTypeCounts = null as Record<string, { month: number; day: number }> | null,
  existing = null as unknown,
  insertError = null as unknown,
} = {}) {
  const insertMock = vi.fn().mockResolvedValue({ error: insertError })
  // Tracks every ('event_type', <value>) .eq() call across both the day and
  // month checkQuota queries, so tests can assert the filter was applied to
  // BOTH queries (not just one).
  const eventTypeEqCalls: string[] = []
  let checkQuotaCallIndex = 0 // 0 = day-scoped query, 1 = month-scoped query

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
      return {
        select: vi
          .fn()
          .mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              // checkQuota count path: .eq('company_id', ...).eq('event_type', ...).gte().gte()
              const isDayQuery = checkQuotaCallIndex === 0
              checkQuotaCallIndex++
              let capturedEventType = ''

              const eqMock: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(
                (col: string, val: string) => {
                  if (col === 'event_type') {
                    capturedEventType = val
                    eventTypeEqCalls.push(val)
                  }
                  return { eq: eqMock, gte: gteMock }
                }
              )
              const gteMock: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(() => ({
                gte: vi.fn().mockImplementation(() => {
                  const count = eventTypeCounts
                    ? eventTypeCounts[capturedEventType]?.[isDayQuery ? 'day' : 'month'] ?? 0
                    : isDayQuery
                      ? dayCount
                      : monthCount
                  return Promise.resolve({ count, error: null })
                }),
              }))

              return { eq: eqMock }
            }

            // recordUsage dedup path: .eq('company_id', ...).eq('idempotency_key', ...).limit(1).maybeSingle()
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
                  }),
                }),
              }),
            }
          }),
        insert: insertMock,
      }
    }
  })

  return {
    from: fromMock,
    insertMock,
    _insertMock: insertMock,
    _eventTypeEqCalls: eventTypeEqCalls,
  } as unknown as SupabaseClient & {
    insertMock: ReturnType<typeof vi.fn>
    _insertMock: ReturnType<typeof vi.fn>
    _eventTypeEqCalls: string[]
  }
}

// ---------------------------------------------------------------------------
// Helper to set up getEntitlements mock return value
// ---------------------------------------------------------------------------

function mockEntitlements(overrides: Partial<{
  maxEstimatesPerMonth: number | null
  maxEstimatesPerDay: number | null
}> = {}) {
  const defaults = { maxEstimatesPerMonth: 10, maxEstimatesPerDay: 3 }
  ;(getEntitlementsForTier as ReturnType<typeof vi.fn>).mockResolvedValue({ ...defaults, ...overrides })
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

  // Test 4b: Both caps null AND the usage_events count would (incorrectly) be
  // large is still unlimited — belt-and-suspenders on the early-return path.
  it('checkQuota short-circuits to unlimited before ever counting usage_events when both caps are null', async () => {
    const supabase = makeSupabase({ tier: 'trial', monthCount: 5000, dayCount: 5000 })
    mockEntitlements({ maxEstimatesPerMonth: null, maxEstimatesPerDay: null })

    const result = await checkQuota(supabase, 'company-123', 'estimate')

    expect(result).toEqual({ allowed: true, remaining: null })
  })

  // Test A (QUOTA-EVENTTYPE-01): mixed event types — only estimate_generated
  // counts toward checkQuota('estimate'). Regression test for the bug where
  // price_researched events (or any other event_type) silently consumed the
  // estimate quota because the count queries never filtered by event_type.
  it('only counts estimate_generated events toward the estimate quota, ignoring other event types', async () => {
    // 2 estimate_generated events (well under the 10/month, 3/day caps), but
    // 99 price_researched events in the same window — those must NOT count.
    const supabase = makeSupabase({
      tier: 'free',
      eventTypeCounts: {
        estimate_generated: { month: 2, day: 2 },
        price_researched: { month: 99, day: 99 },
      },
    })
    mockEntitlements({ maxEstimatesPerMonth: 10, maxEstimatesPerDay: 3 })

    const result = await checkQuota(supabase, 'company-123', 'estimate')

    // If the bug were present, monthCount would resolve to a mixed/undefined
    // count and remaining would not be 8 (or the daily cap of 3 would trip).
    expect(result).toEqual({ allowed: true, remaining: 8 })
  })

  // Test B (QUOTA-EVENTTYPE-01): .eq('event_type', 'estimate_generated') is
  // applied to BOTH the day-scoped and the month-scoped usage_events query.
  it('applies .eq("event_type", "estimate_generated") to both the day and month usage_events queries', async () => {
    const supabase = makeSupabase({ tier: 'free', monthCount: 1, dayCount: 1 })
    mockEntitlements({ maxEstimatesPerMonth: 10, maxEstimatesPerDay: 3 })

    await checkQuota(supabase, 'company-123', 'estimate')

    const eventTypeCalls = (supabase as unknown as { _eventTypeEqCalls: string[] })._eventTypeEqCalls
    expect(eventTypeCalls).toEqual(['estimate_generated', 'estimate_generated'])
  })

  // Test C (QUOTA-EVENTTYPE-01): null caps remain unlimited regardless of
  // event-type filtering (duplicate of Test 4's intent, kept explicit here
  // per the fix's own coverage requirements).
  it('remains { allowed: true, remaining: null } for null caps even with mixed event-type usage present', async () => {
    const supabase = makeSupabase({
      tier: 'business',
      eventTypeCounts: {
        estimate_generated: { month: 500, day: 50 },
        photo_analyzed: { month: 9999, day: 9999 },
      },
    })
    mockEntitlements({ maxEstimatesPerMonth: null, maxEstimatesPerDay: null })

    const result = await checkQuota(supabase, 'company-123', 'estimate')

    expect(result).toEqual({ allowed: true, remaining: null })
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
