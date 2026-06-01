import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useJobStatus, pollJob } from '@/hooks/use-job-status'

/**
 * REC-05: hooks/use-job-status.ts interprets the new discriminated-state
 * contract WITHOUT throwing on non-200.
 *
 * Phase 91 rewrites both surfaces:
 *   - pollJob(jobId, signal): Promise<JobResult> — resolves a typed discriminant
 *     for completed / failed / config_unavailable / not_found; only throws on an
 *     aborted signal. The old `throw new Error('Status check failed: <code>')` is gone.
 *   - useJobStatus(jobId): exposes a discriminated state object; NEVER sets
 *     { status: 'Failed', error: 'Status 503' } from a non-200.
 */

const mockFetch = vi.fn()

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  }
}

describe('REC-05: pollJob interprets the discriminated contract', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves a completed result carrying output (does not throw)', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ state: 'completed', output: { estimateId: 'est-1' } })
    )
    const controller = new AbortController()
    const result = await pollJob('evt_xyz', controller.signal)
    expect(result.state).toBe('completed')
    if (result.state === 'completed') {
      expect(result.output).toEqual({ estimateId: 'est-1' })
    }
  })

  it('resolves a config_unavailable result without throwing', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ state: 'config_unavailable' }))
    const controller = new AbortController()
    const result = await pollJob('evt_xyz', controller.signal)
    expect(result.state).toBe('config_unavailable')
  })

  it('resolves a failed result carrying reason (does not throw a raw Status check failed)', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ state: 'failed', reason: 'Estimate generation failed' })
    )
    const controller = new AbortController()
    const result = await pollJob('evt_xyz', controller.signal)
    expect(result.state).toBe('failed')
    if (result.state === 'failed') {
      expect(result.reason).toBe('Estimate generation failed')
    }
  })

  it('resolves a not_found result without throwing', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ state: 'not_found' }))
    const controller = new AbortController()
    const result = await pollJob('evt_xyz', controller.signal)
    expect(result.state).toBe('not_found')
  })
})

describe('REC-05: useJobStatus exposes a discriminated state', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does NOT fetch when jobId is null (idle)', () => {
    renderHook(() => useJobStatus(null))
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('sets state=failed carrying reason on a 200 { state: failed } (not { status: Failed, error: Status 503 })', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ state: 'failed', reason: 'Estimate generation failed' })
    )

    const { result } = renderHook(() => useJobStatus('evt_xyz'))

    await waitFor(() => {
      expect(result.current.state).toBe('failed')
    })
    expect(result.current.reason).toBe('Estimate generation failed')
  })

  it('sets state=config_unavailable on a 200 { state: config_unavailable }', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ state: 'config_unavailable' }))

    const { result } = renderHook(() => useJobStatus('evt_xyz'))

    await waitFor(() => {
      expect(result.current.state).toBe('config_unavailable')
    })
  })

  it('sets state=completed carrying output on a 200 { state: completed }', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ state: 'completed', output: { estimateId: 'est-1' } })
    )

    const { result } = renderHook(() => useJobStatus('evt_xyz'))

    await waitFor(() => {
      expect(result.current.state).toBe('completed')
    })
    expect(result.current.output).toEqual({ estimateId: 'est-1' })
  })
})
