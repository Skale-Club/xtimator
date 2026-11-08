import { describe, it, expect } from 'vitest'
import {
  MAX_HEARTBEAT_SECONDS,
  acceptsVideoGrowth,
  allowedHeartbeat,
  clampDuration,
  clampHeartbeat,
  clampPct,
  mergeIncomingRanges,
  requiredTextActiveSeconds,
  shouldAutoComplete,
  trackSchema,
} from '@/lib/academy/tracking'

describe('heartbeat clamping', () => {
  it('caps a single heartbeat at 20 seconds', () => {
    expect(MAX_HEARTBEAT_SECONDS).toBe(20)
    expect(clampHeartbeat(15)).toBe(15)
    expect(clampHeartbeat(9999)).toBe(20)
  })

  it('rejects negative, NaN and missing deltas', () => {
    expect(clampHeartbeat(-5)).toBe(0)
    expect(clampHeartbeat(Number.NaN)).toBe(0)
    expect(clampHeartbeat(undefined)).toBe(0)
  })

  it('never credits more than wall-clock time since the last heartbeat', () => {
    // 20 s claimed, but only 3 s passed server-side -> 3 + 2 s slack
    expect(allowedHeartbeat(20, 3_000)).toBe(5)
    // normal 15 s cadence
    expect(allowedHeartbeat(15, 15_000)).toBe(15)
    // first write for the row: just the clamp
    expect(allowedHeartbeat(40, null)).toBe(20)
  })

  it('clamps percentages and durations', () => {
    expect(clampPct(140)).toBe(100)
    expect(clampPct(-3)).toBe(0)
    expect(clampPct(undefined)).toBeNull()
    expect(clampDuration(0)).toBeNull()
    expect(clampDuration(120.4)).toBe(120)
    expect(clampDuration(1e9)).toBe(6 * 60 * 60)
  })
})

describe('video range handling', () => {
  it('merges incoming ranges into stored ones, clamped to the duration', () => {
    const { ranges, watchedSeconds } = mergeIncomingRanges([[0, 10]], [[8, 20], [95, 500]], 100)
    expect(ranges).toEqual([[0, 20], [95, 100]])
    expect(watchedSeconds).toBe(25)
  })

  it('rejects implausible growth (forged "watched everything")', () => {
    expect(acceptsVideoGrowth(10, 10_000)).toBe(true)
    expect(acceptsVideoGrowth(600, 10_000)).toBe(false)
    expect(acceptsVideoGrowth(0, 10_000)).toBe(true)
    expect(acceptsVideoGrowth(30, null)).toBe(true)
    expect(acceptsVideoGrowth(300, null)).toBe(false)
  })
})

describe('auto-complete rule', () => {
  const video = { hasVideo: true, activeSeconds: 0, expectedReadingSeconds: 0 }
  const text = { hasVideo: false, watchedFraction: 0 }

  it('video lessons complete at 90% actually watched', () => {
    expect(shouldAutoComplete({ ...video, watchedFraction: 0.9, scrollPct: 0 })).toBe(true)
    expect(shouldAutoComplete({ ...video, watchedFraction: 0.89, scrollPct: 100 })).toBe(false)
  })

  it('text-only: scrolled to the end is not enough without active time', () => {
    expect(shouldAutoComplete({ ...text, scrollPct: 100, activeSeconds: 0, expectedReadingSeconds: 60 })).toBe(false)
    expect(shouldAutoComplete({ ...text, scrollPct: 100, activeSeconds: 14, expectedReadingSeconds: 10 })).toBe(false)
  })

  it('text-only: needs max(15 s, 50% of expected reading time)', () => {
    expect(requiredTextActiveSeconds(10)).toBe(15)
    expect(requiredTextActiveSeconds(120)).toBe(60)
    expect(shouldAutoComplete({ ...text, scrollPct: 96, activeSeconds: 15, expectedReadingSeconds: 10 })).toBe(true)
    expect(shouldAutoComplete({ ...text, scrollPct: 96, activeSeconds: 59, expectedReadingSeconds: 120 })).toBe(false)
    expect(shouldAutoComplete({ ...text, scrollPct: 96, activeSeconds: 60, expectedReadingSeconds: 120 })).toBe(true)
  })

  it('text-only: enough time but not scrolled does not complete', () => {
    expect(shouldAutoComplete({ ...text, scrollPct: 60, activeSeconds: 600, expectedReadingSeconds: 60 })).toBe(false)
  })
})

describe('trackSchema', () => {
  const ids = { courseId: 'fixture-course-0001', lessonId: 'fixture-lesson-text-only' }

  it('accepts a normal heartbeat', () => {
    const parsed = trackSchema.safeParse({ ...ids, activeSecondsDelta: 15, maxScrollPct: 40, videoRanges: [[0, 12]] })
    expect(parsed.success).toBe(true)
  })

  it('rejects unknown events, bad ids and non-finite numbers', () => {
    expect(trackSchema.safeParse({ ...ids, event: 'hack' }).success).toBe(false)
    expect(trackSchema.safeParse({ ...ids, lessonId: '../etc' }).success).toBe(false)
    expect(trackSchema.safeParse({ ...ids, activeSecondsDelta: Number.POSITIVE_INFINITY }).success).toBe(false)
    expect(trackSchema.safeParse({ ...ids, videoRanges: [[0, 1, 2]] }).success).toBe(false)
  })

  it('caps the number of ranges per request', () => {
    const many = Array.from({ length: 401 }, (_, i) => [i, i + 1])
    expect(trackSchema.safeParse({ ...ids, videoRanges: many }).success).toBe(false)
  })
})
