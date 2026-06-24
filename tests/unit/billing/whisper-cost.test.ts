import { describe, it, expect } from 'vitest'

/**
 * COST-02: Pure Whisper/STT cost helper contract.
 *
 * Whisper (OpenAI whisper-1, direct) returns ONLY text — no usage/cost. Cost is
 * COMPUTED: (durationSeconds / 60) × WHISPER_USD_PER_MINUTE.
 *
 *   (a) computeWhisperCostUsd(120) === 2 × rate (120s = 2 min)
 *   (b) computeWhisperCostUsd(0) === null      (zero duration → NULL, never 0)
 *   (c) computeWhisperCostUsd(null|undefined) === null (unknown → null)
 *   (d) computeWhisperCostUsd(-5) === null     (negative/invalid → null)
 *   (e) WHISPER_USD_PER_MINUTE is a positive number (default 0.006)
 *
 * null vs 0 discipline (Phase 110): an unknown/zero duration must be NULL so
 * calibration excludes it from the mean rather than biasing toward zero.
 */

import {
  WHISPER_USD_PER_MINUTE,
  computeWhisperCostUsd,
} from '@/lib/billing/whisper-cost'

describe('whisper-cost: WHISPER_USD_PER_MINUTE', () => {
  it('is a positive number (default 0.006)', () => {
    expect(typeof WHISPER_USD_PER_MINUTE).toBe('number')
    expect(WHISPER_USD_PER_MINUTE).toBeGreaterThan(0)
    // Default OpenAI whisper-1 list rate when the env override is absent.
    expect(WHISPER_USD_PER_MINUTE).toBe(0.006)
  })
})

describe('whisper-cost: computeWhisperCostUsd', () => {
  it('computes minutes × rate (120s = 2 min)', () => {
    expect(computeWhisperCostUsd(120)).toBe(2 * WHISPER_USD_PER_MINUTE)
  })

  it('computes a fractional minute correctly (30s = 0.5 min)', () => {
    expect(computeWhisperCostUsd(30)).toBe(0.5 * WHISPER_USD_PER_MINUTE)
  })

  it('returns null for zero duration (never 0)', () => {
    expect(computeWhisperCostUsd(0)).toBeNull()
  })

  it('returns null for null duration', () => {
    expect(computeWhisperCostUsd(null)).toBeNull()
  })

  it('returns null for undefined duration', () => {
    expect(computeWhisperCostUsd(undefined)).toBeNull()
  })

  it('returns null for a negative duration (invalid)', () => {
    expect(computeWhisperCostUsd(-5)).toBeNull()
  })

  it('returns null for NaN duration (invalid)', () => {
    expect(computeWhisperCostUsd(Number.NaN)).toBeNull()
  })
})
