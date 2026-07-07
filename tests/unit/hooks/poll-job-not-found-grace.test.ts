import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pollJob } from '@/hooks/use-job-status'

/**
 * 260707-kgn regression coverage: production evidence (attempt 4a26ffb7,
 * 2026-07-07 18:40 UTC) showed the client poll /api/jobs get a `not_found`
 * body at t+1s while the Inngest run wasn't created until t+3s — two seconds
 * LATER. pollJob previously treated `not_found` as immediately terminal, so
 * the user saw "We could not find this job — please retry." even though the
 * server-owned pipeline went on to succeed end-to-end. pollJob now grace-
 * periods a `not_found` body for NOT_FOUND_GRACE_MS (20s) before treating it
 * as terminal — this file covers that exact sequence plus the two edges
 * (grace expires; a real `failed` is still immediate).
 */

const mockFetch = vi.fn()

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  }
}

describe('260707-kgn: pollJob not_found grace window', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('not_found then completed within grace → completed (the exact production sequence)', async () => {
    vi.useFakeTimers()
    let callCount = 0
    mockFetch.mockImplementation(() => {
      callCount += 1
      if (callCount <= 2) return Promise.resolve(jsonResponse({ state: 'not_found' }))
      return Promise.resolve(
        jsonResponse({ state: 'completed', output: { estimateId: 'est-1' } })
      )
    })

    const controller = new AbortController()
    const promise = pollJob('evt_xyz', controller.signal)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.state).toBe('completed')
    if (result.state === 'completed') {
      expect(result.output).toEqual({ estimateId: 'est-1' })
    }
    expect(callCount).toBe(3)
  })

  it('not_found persisting past grace → not_found (terminal once the grace window elapses)', async () => {
    vi.useFakeTimers()
    mockFetch.mockResolvedValue(jsonResponse({ state: 'not_found' }))

    const controller = new AbortController()
    const promise = pollJob('evt_xyz', controller.signal)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.state).toBe('not_found')
  })

  it('failed is still immediate — never grace-periods a real failed run', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ state: 'failed', reason: 'Estimate generation failed' })
    )

    const controller = new AbortController()
    const result = await pollJob('evt_xyz', controller.signal)

    expect(result.state).toBe('failed')
    if (result.state === 'failed') {
      expect(result.reason).toBe('Estimate generation failed')
    }
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
