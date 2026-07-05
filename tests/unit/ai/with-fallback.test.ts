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

// Sentry mock retained (harmless) so the module graph parses even though
// with-fallback.ts no longer imports Sentry directly — notifyOps now owns it.
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))

// The observability signal now routes through notifyOps (the never-throw
// Sentry + Telegram fan-out); the observability block asserts on THIS mock.
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: vi.fn() }))

import { notifyOps } from '@/lib/observability/ops-alert'
import { callWithFallback, ProvidersUnavailableError } from '@/lib/ai/with-fallback'

const mockNotifyOps = notifyOps as ReturnType<typeof vi.fn>

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

/**
 * quick-260705-bml (FIX-2) → quick-260705-c1y-02 — silent-fallback observability.
 *
 * A successful primary→fallback (OpenRouter down, Gemini served) previously
 * returned fallbackFired:true but emitted NO alert, so a silent degradation ran
 * for hours undetected. callWithFallback now routes a never-throw signal through
 * `notifyOps` (the Sentry + Telegram ops fan-out) on the successful-fallback
 * branch, escalating to 'error' on a billing/auth primary failure. The signal is
 * a pure side-effect: it never changes control flow, the return shape, or the
 * both-fail path, and a throwing notifyOps never breaks the fallback result.
 */
describe('callWithFallback observability (quick-260705-c1y-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('successful fallback — routes exactly one warning notifyOps for the served-by-fallback signal', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('primary down'))
    const fallback = vi.fn().mockResolvedValue('B')

    const outcome = await callWithFallback({ op: 'generate', primary, fallback })

    expect(outcome.result).toBe('B')
    expect(outcome.servedBy).toBe('fallback')
    expect(mockNotifyOps).toHaveBeenCalledTimes(1)
    const [alert] = mockNotifyOps.mock.calls[0]
    expect(alert.kind).toBe('ai_fallback')
    expect(alert.severity).toBe('warning')
    // The op rides along in the title; the primary error rides along in the message.
    expect(alert.title).toContain('generate')
    expect(alert.title).toContain('primary down')
    expect(String(alert.message)).toContain('primary down')
    // Non-billing primary error → no ':billing' dedupe suffix.
    expect(alert.dedupeKey).toBe('ai_fallback:generate')
  })

  it('billing/credits primary error (402 / Insufficient credits) — escalates to error + :billing dedupeKey', async () => {
    const primary = vi
      .fn()
      .mockRejectedValue(new Error('OpenRouter request failed (402): Insufficient credits'))
    const fallback = vi.fn().mockResolvedValue('B')

    await callWithFallback({ op: 'generate', primary, fallback })

    expect(mockNotifyOps).toHaveBeenCalledTimes(1)
    const [alert] = mockNotifyOps.mock.calls[0]
    expect(alert.severity).toBe('error')
    expect(alert.dedupeKey).toBe('ai_fallback:generate:billing')
  })

  it('auth primary error (401 / not configured) — escalates to error', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('Gemini API key not configured'))
    const fallback = vi.fn().mockResolvedValue('B')

    await callWithFallback({ op: 'transcribe', primary, fallback })

    const [alert] = mockNotifyOps.mock.calls[0]
    expect(alert.severity).toBe('error')
    expect(alert.dedupeKey).toBe('ai_fallback:transcribe:billing')
  })

  it('happy path (primary resolves) — does NOT call notifyOps', async () => {
    const primary = vi.fn().mockResolvedValue('A')
    const fallback = vi.fn().mockResolvedValue('B')

    await callWithFallback({ op: 'generate', primary, fallback })

    expect(mockNotifyOps).toHaveBeenCalledTimes(0)
  })

  it('both fail — the successful-fallback signal is NOT emitted from the both-fail branch', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('PRIMARY_ERR'))
    const fallback = vi.fn().mockRejectedValue(new Error('FALLBACK_ERR'))

    await expect(
      callWithFallback({ op: 'generate', primary, fallback })
    ).rejects.toBeInstanceOf(ProvidersUnavailableError)

    // The 'served by fallback' signal belongs to the SUCCESSFUL-fallback branch;
    // a both-fail run must not emit it.
    expect(mockNotifyOps).not.toHaveBeenCalled()
  })

  it('never-throw — a throwing notifyOps does not break the fallback result', async () => {
    vi.mocked(mockNotifyOps).mockImplementationOnce(() => {
      throw new Error('ops down')
    })
    const primary = vi.fn().mockRejectedValue(new Error('primary down'))
    const fallback = vi.fn().mockResolvedValue('B')

    const outcome = await callWithFallback({ op: 'generate', primary, fallback })

    expect(outcome.result).toBe('B')
    expect(outcome.servedBy).toBe('fallback')
    expect(outcome.fallbackFired).toBe(true)
  })
})
