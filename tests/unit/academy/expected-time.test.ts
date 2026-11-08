import { describe, it, expect } from 'vitest'
import { countWords, expectedSeconds, isTooFast } from '@/lib/academy/expected-time'

describe('expectedSeconds', () => {
  it('uses Expected minutes when set', () => {
    expect(expectedSeconds({ expectedMinutes: 4, videoDurationSeconds: 999, bodyWords: 5000 })).toBe(240)
  })

  it('derives video duration + body words at 200 wpm', () => {
    // 120 s video + 400 words (2 min = 120 s)
    expect(expectedSeconds({ expectedMinutes: null, videoDurationSeconds: 120, bodyWords: 400 })).toBe(240)
  })

  it('text-only lesson: reading time only', () => {
    expect(expectedSeconds({ expectedMinutes: null, videoDurationSeconds: null, bodyWords: 200 })).toBe(60)
  })

  it('treats 0 / empty Expected minutes as unset', () => {
    expect(expectedSeconds({ expectedMinutes: 0, videoDurationSeconds: 60, bodyWords: 0 })).toBe(60)
  })

  it('counts words', () => {
    expect(countWords('  one two\nthree  ')).toBe(3)
    expect(countWords('   ')).toBe(0)
  })
})

describe('isTooFast', () => {
  it('flags completion with active time under 50% of expected', () => {
    expect(isTooFast({ completed: true, activeSeconds: 40, expectedSeconds: 100, videoWatchedFraction: null })).toBe(true)
    expect(isTooFast({ completed: true, activeSeconds: 60, expectedSeconds: 100, videoWatchedFraction: null })).toBe(false)
  })

  it('flags completion with under 50% of the video watched', () => {
    expect(isTooFast({ completed: true, activeSeconds: 500, expectedSeconds: 100, videoWatchedFraction: 0.3 })).toBe(true)
  })

  it('never flags an incomplete lesson', () => {
    expect(isTooFast({ completed: false, activeSeconds: 1, expectedSeconds: 100, videoWatchedFraction: 0 })).toBe(false)
  })
})
