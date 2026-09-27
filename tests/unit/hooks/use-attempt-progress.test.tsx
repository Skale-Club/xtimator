import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

/**
 * 260927: useAttemptProgress reads one attempt's journal for pages that show
 * the checklist outside the capture popup. It must keep polling while pending
 * and stop for good on a terminal outcome.
 */

const getAttemptOutcome = vi.fn()
const getStepMedians = vi.fn()
vi.mock('@/lib/actions/attempt-outcome', () => ({
  getAttemptOutcome: (id: string) => getAttemptOutcome(id),
  getStepMedians: () => getStepMedians(),
}))

import { ATTEMPT_PROGRESS_POLL_MS, useAttemptProgress } from '@/hooks/use-attempt-progress'

const pending = {
  state: 'pending',
  lastStep: 'generate_estimate',
  lastStatus: 'started',
  completedSteps: ['save_recording'],
  activeStepStartedAt: '2026-09-27T12:00:00Z',
  phaseVisits: [{ phase: 'drafting', startedAt: '2026-09-27T12:00:02Z', detail: {} }],
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  getStepMedians.mockResolvedValue({ transcribe: 5_000 })
})
afterEach(() => {
  vi.useRealTimers()
})

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useAttemptProgress', () => {
  it('does nothing without an attempt', async () => {
    const { result } = renderHook(() => useAttemptProgress(null))
    await flush(ATTEMPT_PROGRESS_POLL_MS * 2)
    expect(getAttemptOutcome).not.toHaveBeenCalled()
    expect(result.current.state.progress).toBeNull()
  })

  it('exposes the pending progress with the active step derived from the journal', async () => {
    getAttemptOutcome.mockResolvedValue(pending)
    const { result } = renderHook(() => useAttemptProgress('a1'))
    await flush()
    expect(result.current.state.progress).toMatchObject({
      completedSteps: ['save_recording'],
      activeStep: 'generate_estimate',
      phaseVisits: pending.phaseVisits,
    })
    expect(result.current.medians).toEqual({ transcribe: 5_000 })
  })

  it('stops polling once the journal reports a terminal outcome', async () => {
    getAttemptOutcome.mockResolvedValueOnce(pending).mockResolvedValue({ state: 'completed', estimateId: 'e1' })
    const { result } = renderHook(() => useAttemptProgress('a1'))
    await flush()
    await flush(ATTEMPT_PROGRESS_POLL_MS)
    expect(result.current.state.outcome).toEqual({ state: 'completed', estimateId: 'e1' })
    const calls = getAttemptOutcome.mock.calls.length
    await flush(ATTEMPT_PROGRESS_POLL_MS * 3)
    expect(getAttemptOutcome.mock.calls.length).toBe(calls)
  })

  it('keeps polling through a failed read', async () => {
    getAttemptOutcome.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(pending)
    const { result } = renderHook(() => useAttemptProgress('a1'))
    await flush()
    await flush(ATTEMPT_PROGRESS_POLL_MS)
    expect(result.current.state.progress).not.toBeNull()
  })
})
