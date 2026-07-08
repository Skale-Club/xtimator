import { describe, it, expect } from 'vitest'

/**
 * 260707-shg: pure helpers backing the scrolling amplitude-history waveform
 * (components/workspace/audio/waveform-visualizer.tsx). Canvas-agnostic —
 * exercised directly here without any DOM/AudioContext mocking.
 */

import {
  rmsFromTimeDomain,
  normalizeAmplitude,
  pushBar,
  MIN_BAR,
} from '@/lib/audio/waveform-history'

describe('rmsFromTimeDomain', () => {
  it('silence (all values centered on 128) is ~0', () => {
    const silence = new Uint8Array(64).fill(128)
    expect(rmsFromTimeDomain(silence)).toBeCloseTo(0, 5)
  })

  it('full-scale square wave (0/255 alternating) is ~1', () => {
    const loud = new Uint8Array(64)
    for (let i = 0; i < loud.length; i++) {
      loud[i] = i % 2 === 0 ? 0 : 255
    }
    expect(rmsFromTimeDomain(loud)).toBeGreaterThan(0.95)
    expect(rmsFromTimeDomain(loud)).toBeLessThanOrEqual(1.001)
  })

  it('empty buffer returns 0 (defensive — avoids NaN from a 0-length mean)', () => {
    expect(rmsFromTimeDomain(new Uint8Array(0))).toBe(0)
  })

  it('a constant offset from center produces a proportional, non-zero rms', () => {
    const half = new Uint8Array(64).fill(128 + 64) // half amplitude, one direction
    const rms = rmsFromTimeDomain(half)
    expect(rms).toBeGreaterThan(0.4)
    expect(rms).toBeLessThan(0.6)
  })
})

describe('normalizeAmplitude', () => {
  const halfHeight = 40

  it('silence (rms=0) collapses to the minimum bar height', () => {
    expect(normalizeAmplitude(0, halfHeight)).toBe(MIN_BAR)
  })

  it('respects a custom minBar floor', () => {
    expect(normalizeAmplitude(0, halfHeight, 5)).toBe(5)
  })

  it('clamps loud input to halfHeight — never exceeds the canvas half-height', () => {
    expect(normalizeAmplitude(1, halfHeight)).toBeLessThanOrEqual(halfHeight)
    expect(normalizeAmplitude(10, halfHeight)).toBeLessThanOrEqual(halfHeight)
  })

  it('is monotonically non-decreasing as rms increases', () => {
    const low = normalizeAmplitude(0.05, halfHeight)
    const mid = normalizeAmplitude(0.3, halfHeight)
    const high = normalizeAmplitude(0.8, halfHeight)
    expect(mid).toBeGreaterThanOrEqual(low)
    expect(high).toBeGreaterThanOrEqual(mid)
  })

  it('never renders below minBar even for a tiny positive rms', () => {
    expect(normalizeAmplitude(0.001, halfHeight)).toBeGreaterThanOrEqual(MIN_BAR)
  })
})

describe('pushBar', () => {
  it('appends a new value as the newest (last) element', () => {
    const result = pushBar([0.1, 0.2], 0.3, 10)
    expect(result).toEqual([0.1, 0.2, 0.3])
  })

  it('scrolls (drops the oldest) once maxBars is exceeded', () => {
    const result = pushBar([0.1, 0.2, 0.3], 0.4, 3)
    expect(result).toEqual([0.2, 0.3, 0.4])
    expect(result.length).toBe(3)
  })

  it('never grows past maxBars across repeated pushes', () => {
    let buffer: number[] = []
    for (let i = 0; i < 20; i++) {
      buffer = pushBar(buffer, i, 5)
    }
    expect(buffer.length).toBe(5)
    expect(buffer).toEqual([15, 16, 17, 18, 19])
  })

  it('is immutable — the input array is never mutated', () => {
    const original = [0.1, 0.2, 0.3]
    const originalCopy = [...original]
    pushBar(original, 0.4, 3)
    expect(original).toEqual(originalCopy)
  })

  it('handles maxBars=1 by always keeping only the newest bar', () => {
    const result = pushBar([0.5], 0.9, 1)
    expect(result).toEqual([0.9])
  })
})
