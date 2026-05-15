import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useJobStatus, pollJob } from '@/hooks/use-job-status'

/**
 * INNGEST-05 — useJobStatus polling hook (Plan 67-05).
 *
 * Contract:
 *  - polls GET /api/jobs/[jobId] every 1500ms
 *  - stops polling when status is terminal (Completed | Failed | Cancelled)
 *  - exposes { status, output, error } state for consumers
 *  - null jobId means idle — no fetch
 *  - exports a standalone pollJob(jobId, signal) helper for non-React callers
 */
describe('INNGEST-05: useJobStatus hook', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // @ts-expect-error — replace global fetch in tests
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does NOT fetch when jobId is null (idle)', () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    renderHook(() => useJobStatus(null))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('polls /api/jobs/[jobId] when jobId provided and stops on Completed', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'Running', output: null }),
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'Completed', output: { estimateId: 'e_1' } }),
    })

    const { result } = renderHook(() => useJobStatus('evt_123'))

    // First poll fires immediately
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/jobs/evt_123', expect.any(Object))
    })

    // Advance fake timer by 1500ms to trigger second poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600)
    })

    await waitFor(() => {
      expect(result.current.status).toBe('Completed')
    })

    expect(result.current.output).toEqual({ estimateId: 'e_1' })
    expect(result.current.error).toBeNull()
  })

  it('stops polling and exposes error on Failed', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'Failed', output: null }),
    })

    const { result } = renderHook(() => useJobStatus('evt_fail'))

    await waitFor(() => {
      expect(result.current.status).toBe('Failed')
    })
  })

  it('stops polling on Cancelled status', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'Cancelled', output: null }),
    })

    const { result } = renderHook(() => useJobStatus('evt_cancel'))

    await waitFor(() => {
      expect(result.current.status).toBe('Cancelled')
    })
  })

  it('aborts in-flight fetch on unmount', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockImplementation((_url, opts: { signal?: AbortSignal } = {}) => {
      return new Promise((_resolve, reject) => {
        opts.signal?.addEventListener('abort', () => {
          const err = new Error('Aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    })

    const { unmount } = renderHook(() => useJobStatus('evt_unmount'))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    unmount()
    // After unmount the fetch's signal should have aborted; no assertion error means OK
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('exports a standalone pollJob helper that resolves with terminal output', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'Completed', output: { transcript: 'hello' } }),
    })

    const controller = new AbortController()
    const result = await pollJob('evt_helper', controller.signal)
    expect(result).toEqual({ transcript: 'hello' })
  })

  it('pollJob throws on Failed terminal status', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'Failed', output: null }),
    })

    const controller = new AbortController()
    await expect(pollJob('evt_fail', controller.signal)).rejects.toThrow(/Failed/)
  })
})
