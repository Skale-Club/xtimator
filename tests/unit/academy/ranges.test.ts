import { describe, it, expect } from 'vitest'
import {
  clampRanges,
  mergeRanges,
  parseStoredRanges,
  recordTick,
  sumRanges,
  watchedFraction,
  type RecorderState,
} from '@/lib/academy/ranges'

describe('mergeRanges', () => {
  it('merges overlapping and touching ranges and sorts them', () => {
    expect(mergeRanges([[10, 20], [0, 5], [5, 8], [18, 30]])).toEqual([[0, 8], [10, 30]])
  })

  it('drops invalid, empty and negative ranges', () => {
    expect(mergeRanges([[5, 5], [8, 3], [-4, 2], [Number.NaN, 4]])).toEqual([])
  })

  it('does not double count when summing', () => {
    expect(sumRanges([[0, 10], [5, 15]])).toBe(15)
  })
})

describe('clampRanges / watchedFraction', () => {
  it('clamps ranges to the video duration', () => {
    expect(clampRanges([[0, 50], [90, 400]], 100)).toEqual([[0, 50], [90, 100]])
  })

  it('computes the watched fraction, capped at 1', () => {
    expect(watchedFraction([[0, 45]], 90)).toBeCloseTo(0.5)
    expect(watchedFraction([[0, 500]], 90)).toBe(1)
    expect(watchedFraction([[0, 10]], null)).toBe(0)
  })

  it('parses the stored jsonb defensively', () => {
    expect(parseStoredRanges('nope')).toEqual([])
    expect(parseStoredRanges([[0, 10], 'x', [4]])).toEqual([[0, 10]])
  })
})

describe('recordTick (seeking records nothing)', () => {
  const start: RecorderState = { last: null, ranges: [] }

  it('records normal 1 s playback', () => {
    let s = recordTick(start, 10)
    s = recordTick(s, 11)
    s = recordTick(s, 12)
    s = recordTick(s, 13)
    expect(sumRanges(s.ranges)).toBe(3)
  })

  it('does not count a seek to the end of the video', () => {
    let s = recordTick(start, 0)
    s = recordTick(s, 1)
    s = recordTick(s, 90) // user dragged the scrubber to the end
    s = recordTick(s, 91)
    expect(sumRanges(s.ranges)).toBe(2)
    expect(watchedFraction(s.ranges, 100)).toBeLessThan(0.1)
  })

  it('does not count backwards seeks', () => {
    let s = recordTick(start, 50)
    s = recordTick(s, 51)
    s = recordTick(s, 10)
    s = recordTick(s, 11)
    expect(s.ranges).toEqual([[10, 11], [50, 51]])
  })

  it('tolerates 2x playback', () => {
    let s = recordTick(start, 0)
    s = recordTick(s, 2)
    s = recordTick(s, 4)
    expect(sumRanges(s.ranges)).toBe(4)
  })

  it('reaching 90% by really watching passes, jumping does not', () => {
    let honest: RecorderState = { last: null, ranges: [] }
    for (let t = 0; t <= 95; t++) honest = recordTick(honest, t)
    expect(watchedFraction(honest.ranges, 100)).toBeGreaterThanOrEqual(0.9)

    let skipper: RecorderState = { last: null, ranges: [] }
    for (const t of [0, 1, 30, 60, 95, 96]) skipper = recordTick(skipper, t)
    expect(watchedFraction(skipper.ranges, 100)).toBeLessThan(0.1)
  })
})
