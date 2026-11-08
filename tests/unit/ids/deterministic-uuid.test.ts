import { describe, it, expect } from 'vitest'
import { deterministicUuid } from '@/lib/ids/deterministic-uuid'
import { visionCostAttemptId } from '@/lib/inngest/functions/analyze-photos'

// ai_cost_events.attempt_id is UUID NOT NULL (supabase/migrations/
// 20260624000003_phase110_ai_cost_events.sql). Any derived cost attempt id must
// be a valid UUID, or Postgres rejects the insert (22P02) and recordAICost
// swallows it — the cost would silently never be recorded or debited.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('deterministicUuid', () => {
  it('returns a valid RFC 4122 version 5 UUID', () => {
    expect(deterministicUuid('anything')).toMatch(UUID_RE)
  })

  it('is stable for the same name and different for different names', () => {
    expect(deterministicUuid('a:price_research')).toBe(deterministicUuid('a:price_research'))
    expect(deterministicUuid('a:price_research')).not.toBe(deterministicUuid('b:price_research'))
  })

  it('matches the RFC 4122 v5 reference vector for the DNS namespace', () => {
    // uuidv5('www.example.com', DNS) — the published reference value.
    expect(deterministicUuid('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2'
    )
  })

  it('rejects a namespace that is not a UUID', () => {
    expect(() => deterministicUuid('x', 'not-a-uuid')).toThrow()
  })
})

describe('visionCostAttemptId', () => {
  it('is a valid UUID, stable per (attempt, run, photo), distinct across photos and runs', () => {
    const a = visionCostAttemptId('11111111-1111-4111-8111-111111111111', 'req-1', 'photo-1')
    expect(a).toMatch(UUID_RE)
    expect(visionCostAttemptId('11111111-1111-4111-8111-111111111111', 'req-1', 'photo-1')).toBe(a)
    expect(visionCostAttemptId('11111111-1111-4111-8111-111111111111', 'req-1', 'photo-2')).not.toBe(a)
    expect(visionCostAttemptId('11111111-1111-4111-8111-111111111111', 'req-2', 'photo-1')).not.toBe(a)
  })
})
