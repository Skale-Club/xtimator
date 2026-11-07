import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * callWithFallback wrapper — OpenRouter ONLY (owner rule). There is no secondary
 * provider: a primary failure raises the marked `ProvidersUnavailableError`
 * (carrying the original error as `.cause`) so callers/UI keep their error shape.
 */

const notifyOpsMock = vi.fn(async (_a: unknown) => undefined)
vi.mock('@/lib/observability/ops-alert', () => ({
  notifyOps: (a: unknown) => notifyOpsMock(a),
}))

import {
  callWithFallback,
  ProvidersUnavailableError,
  InvalidEstimateOutputError,
} from '@/lib/ai/with-fallback'

describe('callWithFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('primary success - returns servedBy:primary and invokes primary exactly once', async () => {
    const primary = vi.fn().mockResolvedValue('A')

    const outcome = await callWithFallback({ op: 'generate', primary })

    expect(outcome).toEqual({ result: 'A', servedBy: 'primary' })
    expect(primary).toHaveBeenCalledTimes(1)
  })

  it('primary failure - throws a marked ProvidersUnavailableError carrying the error as cause', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('PRIMARY_ERR'))

    let caught: unknown
    try {
      await callWithFallback({ op: 'generate', primary })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(ProvidersUnavailableError)
    expect((caught as { providerUnavailable?: boolean }).providerUnavailable).toBe(true)
    expect(((caught as { cause?: Error }).cause as Error).message).toBe('PRIMARY_ERR')
    // No retry on any other provider: the primary ran exactly once.
    expect(primary).toHaveBeenCalledTimes(1)
  })

  it('invalid-output marker is rethrown UNCHANGED (schema-retry seam handles it)', async () => {
    const invalid = new InvalidEstimateOutputError({ issues: [] } as never)
    const primary = vi.fn().mockRejectedValue(invalid)

    await expect(callWithFallback({ op: 'generate', primary })).rejects.toBe(invalid)
    // A schema failure is not a provider outage: no ops alert.
    expect(notifyOpsMock).not.toHaveBeenCalled()
  })

  it('transient primary failure fires a warning ops alert (non-billing dedupe key)', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('OpenRouter returned 503'))
    await expect(callWithFallback({ op: 'transcribe', primary })).rejects.toBeInstanceOf(
      ProvidersUnavailableError
    )
    expect(notifyOpsMock).toHaveBeenCalledTimes(1)
    expect(notifyOpsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'ai_provider_failed',
        severity: 'warning',
        dedupeKey: 'ai_provider_failed:transcribe',
        suppressWindowSec: 900,
      })
    )
  })

  it.each([
    'OpenRouter 402 insufficient credits',
    'HTTP 401 user not found',
    'OpenRouter API key not configured',
  ])('billing/auth failure "%s" escalates to error with the :billing dedupe key', async (msg) => {
    const primary = vi.fn().mockRejectedValue(new Error(msg))
    await expect(callWithFallback({ op: 'generate', primary })).rejects.toBeInstanceOf(
      ProvidersUnavailableError
    )
    expect(notifyOpsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'ai_provider_failed',
        severity: 'error',
        dedupeKey: 'ai_provider_failed:generate:billing',
      })
    )
  })

  it('a throwing notifyOps never breaks the failure path', async () => {
    notifyOpsMock.mockImplementationOnce(() => {
      throw new Error('alert down')
    })
    const primary = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(callWithFallback({ op: 'vision', primary })).rejects.toBeInstanceOf(
      ProvidersUnavailableError
    )
  })
})
