// tests/unit/quota-price-research.test.ts
// Phase 108 (RMETER-01): price_researched usage event + price_research quota type.
// Covers: the widened CHECK migration static contract, the quota.ts union/mapping
// additions, and recordUsage idempotency for the new 'price_researched' event.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mock entitlements module (quota.ts imports getEntitlementsForTier).
vi.mock('@/lib/entitlements', () => ({
  getEntitlementsForTier: vi.fn(),
}))

import { recordUsage, type EventType, type QuotaType } from '@/lib/quota'

// ---------------------------------------------------------------------------
// Chainable Supabase mock (mirrors tests/unit/quota.test.ts style)
// ---------------------------------------------------------------------------

/**
 * recordUsage chain:
 *   dedup SELECT: .from('usage_events').select('id').eq().eq().limit(1).maybeSingle()
 *   INSERT:       .from('usage_events').insert({...})
 *
 * `existing` is returned by the dedup maybeSingle(); when truthy, recordUsage
 * short-circuits and never inserts.
 */
function makeSupabase({ existing = null as unknown } = {}) {
  const insertMock = vi.fn().mockResolvedValue({ error: null })

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'usage_events') {
      const eqIdempotency = vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
        }),
      })
      const eqMock = vi.fn().mockReturnValue({ eq: eqIdempotency })
      return {
        select: vi.fn().mockReturnValue({ eq: eqMock }),
        insert: insertMock,
      }
    }
    return {}
  })

  return {
    from: fromMock,
    insertMock,
  } as unknown as SupabaseClient & { insertMock: ReturnType<typeof vi.fn> }
}

// ---------------------------------------------------------------------------
// Test 1: migration static contract
// ---------------------------------------------------------------------------

describe('phase108 usage_events.event_type CHECK migration', () => {
  const migrationPath = join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260624000002_phase108_usage_event_price_researched.sql'
  )
  const sql = readFileSync(migrationPath, 'utf8')

  it('widens the CHECK via DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS usage_events_event_type_check/i)
    expect(sql).toMatch(/ADD CONSTRAINT usage_events_event_type_check/i)
    expect(sql).toMatch(/CHECK\s*\(\s*event_type IN/i)
  })

  it('lists all four allowed event types (including price_researched)', () => {
    for (const v of [
      'estimate_generated',
      'photo_analyzed',
      'audio_transcribed',
      'price_researched',
    ]) {
      expect(sql).toContain(`'${v}'`)
    }
  })

  it('is idempotent (DROP IF EXISTS guards a re-run)', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS/i)
  })

  it('contains no secret-looking literals', () => {
    expect(sql).not.toMatch(/sk-ant-|sk_live_|sk_test_|whsec_|sb_secret_/)
  })
})

// ---------------------------------------------------------------------------
// Test 2: quota.ts union + mapping additions
// ---------------------------------------------------------------------------

describe('quota.ts price_research wiring', () => {
  it('EventType union includes price_researched (compile-time assignability)', () => {
    const ev: EventType = 'price_researched'
    expect(ev).toBe('price_researched')
  })

  it('QuotaType union includes price_research (compile-time assignability)', () => {
    const qt: QuotaType = 'price_research'
    expect(qt).toBe('price_research')
  })

  it('quota.ts source maps price_research -> price_researched', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'quota.ts'), 'utf8')
    expect(src).toMatch(/price_research:\s*'price_researched'/)
  })
})

// ---------------------------------------------------------------------------
// Test 3: recordUsage dedup for price_researched
// ---------------------------------------------------------------------------

describe('recordUsage with price_researched', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts a price_researched event_type for a new idempotency key', async () => {
    const supabase = makeSupabase()
    await recordUsage(supabase, 'company-1', 'price_researched', 1, 'attempt:research:couch@@austin|tx')

    const insertSpy = (supabase as unknown as { insertMock: ReturnType<typeof vi.fn> }).insertMock
    expect(insertSpy).toHaveBeenCalledTimes(1)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'price_researched' })
    )
  })

  it('dedups: a second call with the same key is a no-op (insert called once total)', async () => {
    // First call: no existing row -> inserts.
    const first = makeSupabase({ existing: null })
    await recordUsage(first, 'company-1', 'price_researched', 1, 'dup-key')
    expect((first as unknown as { insertMock: ReturnType<typeof vi.fn> }).insertMock).toHaveBeenCalledTimes(1)

    // Second call with the SAME key: dedup SELECT finds the row -> no insert.
    const second = makeSupabase({ existing: { id: 'already-recorded' } })
    await recordUsage(second, 'company-1', 'price_researched', 1, 'dup-key')
    expect((second as unknown as { insertMock: ReturnType<typeof vi.fn> }).insertMock).not.toHaveBeenCalled()
  })
})
