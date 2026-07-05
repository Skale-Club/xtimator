import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * HARD-03 — callWithFallback wrapper (Wave 0 RED scaffold).
 *
 * Pins the OpenRouter→Gemini fallback contract that plan 99-01 implements:
 *   - primary success returns the primary result, marks servedBy:'primary',
 *     fallbackFired:false, and NEVER calls the fallback (QA-03 — exactly 1 call).
 *   - primary failure runs the fallback EXACTLY ONCE and returns its result with
 *     servedBy:'fallback', fallbackFired:true.
 *   - both providers down throws a marked `ProvidersUnavailableError` carrying the
 *     PRIMARY error as `.cause` (so the caller maps it to provider_unavailable).
 *
 * RED today: `@/lib/ai/with-fallback` does not exist (created in 99-01). These tests
 * fail to resolve the module — real RED, not stubbed.
 */

import { callWithFallback, ProvidersUnavailableError } from '@/lib/ai/with-fallback'

describe('callWithFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('primary success — returns servedBy:primary, fallbackFired:false, fallback NOT called', async () => {
    const primary = vi.fn().mockResolvedValue('A')
    const fallback = vi.fn().mockResolvedValue('B')

    const outcome = await callWithFallback({ op: 'generate', primary, fallback })

    expect(outcome.result).toBe('A')
    expect(outcome.servedBy).toBe('primary')
    expect(outcome.fallbackFired).toBe(false)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('single call — primary invoked exactly once on success (QA-03)', async () => {
    const primary = vi.fn().mockResolvedValue('A')
    const fallback = vi.fn().mockResolvedValue('B')

    await callWithFallback({ op: 'generate', primary, fallback })

    expect(primary).toHaveBeenCalledTimes(1)
    expect(fallback).toHaveBeenCalledTimes(0)
  })

  it('fallback fired — primary throws, returns fallback result with servedBy:fallback, fallbackFired:true', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('primary down'))
    const fallback = vi.fn().mockResolvedValue('B')

    const outcome = await callWithFallback({ op: 'generate', primary, fallback })

    expect(outcome.result).toBe('B')
    expect(outcome.servedBy).toBe('fallback')
    expect(outcome.fallbackFired).toBe(true)
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('both fail — throws a marked ProvidersUnavailableError carrying the primary error as cause', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('PRIMARY_ERR'))
    const fallback = vi.fn().mockRejectedValue(new Error('FALLBACK_ERR'))

    await expect(
      callWithFallback({ op: 'generate', primary, fallback })
    ).rejects.toBeInstanceOf(ProvidersUnavailableError)

    let caught: unknown
    try {
      await callWithFallback({ op: 'generate', primary, fallback })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(ProvidersUnavailableError)
    // Marker flag the failure model keys off of.
    expect((caught as { providerUnavailable?: boolean }).providerUnavailable).toBe(true)
    // The cause is the PRIMARY error (canonical signal), NOT the fallback error.
    expect((caught as { cause?: unknown }).cause).toBeInstanceOf(Error)
    expect(((caught as { cause?: Error }).cause as Error).message).toBe('PRIMARY_ERR')
  })

  it('both fail — exposes the fallback error as fallbackCause while .cause stays the primary error (D8)', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('PRIMARY_ERR'))
    const fallback = vi.fn().mockRejectedValue(new Error('FALLBACK_ERR'))

    let caught: unknown
    try {
      await callWithFallback({ op: 'generate', primary, fallback })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(ProvidersUnavailableError)
    expect((caught as { providerUnavailable?: boolean }).providerUnavailable).toBe(true)
    // .cause contract UNCHANGED: still the PRIMARY error.
    expect(((caught as { cause?: Error }).cause as Error).message).toBe('PRIMARY_ERR')
    // Additive: the fallback's own failure is now visible to operators.
    const fallbackCause = (caught as { fallbackCause?: unknown }).fallbackCause
    expect(fallbackCause).toBeInstanceOf(Error)
    expect((fallbackCause as Error).message).toBe('FALLBACK_ERR')
  })
})
