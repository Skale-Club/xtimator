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

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))

import * as Sentry from '@sentry/nextjs'
import { callWithFallback, ProvidersUnavailableError } from '@/lib/ai/with-fallback'

const mockCaptureMessage = Sentry.captureMessage as ReturnType<typeof vi.fn>

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
 * quick-260705-bml (FIX-2) — silent-fallback observability.
 *
 * A successful primary→fallback (OpenRouter down, Gemini served) previously
 * returned fallbackFired:true but emitted NO alert, so a silent degradation ran
 * for hours undetected. callWithFallback now emits a never-throw Sentry signal on
 * the successful-fallback branch, escalating to 'error' on a billing/auth primary
 * failure. The signal is a pure side-effect: it never changes control flow, the
 * return shape, or the both-fail path, and a throwing Sentry mock never breaks the
 * fallback result.
 */
describe('callWithFallback observability (quick-260705-bml FIX-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('successful fallback — emits exactly one warning captureMessage tagged served_by_fallback', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('primary down'))
    const fallback = vi.fn().mockResolvedValue('B')

    const outcome = await callWithFallback({ op: 'generate', primary, fallback })

    expect(outcome.result).toBe('B')
    expect(outcome.servedBy).toBe('fallback')
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    const [, opts] = mockCaptureMessage.mock.calls[0]
    expect(opts.level).toBe('warning')
    expect(opts.tags.op).toBe('generate')
    expect(opts.tags.ai_fallback).toBe('served_by_fallback')
    // Non-billing primary error → no escalation tag.
    expect(opts.tags.ai_primary_down).toBeUndefined()
    // The primary error string rides along for the operator.
    expect(String(opts.extra.primaryError)).toContain('primary down')
  })

  it('billing/credits primary error (402 / Insufficient credits) — escalates to error + ai_primary_down billing_or_auth', async () => {
    const primary = vi
      .fn()
      .mockRejectedValue(new Error('OpenRouter request failed (402): Insufficient credits'))
    const fallback = vi.fn().mockResolvedValue('B')

    await callWithFallback({ op: 'generate', primary, fallback })

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    const [, opts] = mockCaptureMessage.mock.calls[0]
    expect(opts.level).toBe('error')
    expect(opts.tags.ai_primary_down).toBe('billing_or_auth')
  })

  it('auth primary error (401 / not configured) — escalates to error + ai_primary_down billing_or_auth', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('Gemini API key not configured'))
    const fallback = vi.fn().mockResolvedValue('B')

    await callWithFallback({ op: 'transcribe', primary, fallback })

    const [, opts] = mockCaptureMessage.mock.calls[0]
    expect(opts.level).toBe('error')
    expect(opts.tags.ai_primary_down).toBe('billing_or_auth')
  })

  it('happy path (primary resolves) — emits NO captureMessage', async () => {
    const primary = vi.fn().mockResolvedValue('A')
    const fallback = vi.fn().mockResolvedValue('B')

    await callWithFallback({ op: 'generate', primary, fallback })

    expect(mockCaptureMessage).toHaveBeenCalledTimes(0)
  })

  it('both fail — the successful-fallback signal is NOT emitted from the both-fail branch', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('PRIMARY_ERR'))
    const fallback = vi.fn().mockRejectedValue(new Error('FALLBACK_ERR'))

    await expect(
      callWithFallback({ op: 'generate', primary, fallback })
    ).rejects.toBeInstanceOf(ProvidersUnavailableError)

    // The 'served by fallback' warning belongs to the SUCCESSFUL-fallback branch;
    // a both-fail run must not emit it.
    expect(mockCaptureMessage).not.toHaveBeenCalled()
  })

  it('never-throw — a throwing captureMessage does not break the fallback result', async () => {
    vi.mocked(mockCaptureMessage).mockImplementationOnce(() => {
      throw new Error('sentry down')
    })
    const primary = vi.fn().mockRejectedValue(new Error('primary down'))
    const fallback = vi.fn().mockResolvedValue('B')

    const outcome = await callWithFallback({ op: 'generate', primary, fallback })

    expect(outcome.result).toBe('B')
    expect(outcome.servedBy).toBe('fallback')
    expect(outcome.fallbackFired).toBe(true)
  })
})
