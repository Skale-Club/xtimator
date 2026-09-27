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

import {
  ATTEMPT_PROGRESS_EMPTY_GIVE_UP_MS,
  ATTEMPT_PROGRESS_POLL_MS,
  COMPLETED_HOLD_MS,
  useAttemptProgress,
} from '@/hooks/use-attempt-progress'

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

  it('gives up on an attempt the journal says is not this company\'s', async () => {
    getAttemptOutcome.mockResolvedValue({ state: 'unauthorized' })
    const { result } = renderHook(() => useAttemptProgress('foreign'))
    await flush()
    expect(result.current.state.gaveUp).toBe(true)
    const calls = getAttemptOutcome.mock.calls.length
    await flush(ATTEMPT_PROGRESS_POLL_MS * 2)
    expect(getAttemptOutcome.mock.calls.length).toBe(calls)
  })

  it('gives up on an attempt that never writes a journal row', async () => {
    getAttemptOutcome.mockResolvedValue({
      state: 'pending',
      lastStep: null,
      lastStatus: null,
      completedSteps: [],
      activeStepStartedAt: null,
    })
    const { result } = renderHook(() => useAttemptProgress('ghost'))
    await flush()
    expect(result.current.state.gaveUp).toBe(false)
    await flush(ATTEMPT_PROGRESS_EMPTY_GIVE_UP_MS + ATTEMPT_PROGRESS_POLL_MS)
    expect(result.current.state.gaveUp).toBe(true)
  })

  it('holds a completed outcome briefly after the attempt id goes away, then releases it', async () => {
    getAttemptOutcome.mockResolvedValue({ state: 'completed', estimateId: 'e1' })
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useAttemptProgress(id), {
      initialProps: { id: 'a1' as string | null },
    })
    await flush()
    expect(result.current.state.outcome).toEqual({ state: 'completed', estimateId: 'e1' })

    rerender({ id: null })
    expect(result.current.state.outcome).toEqual({ state: 'completed', estimateId: 'e1' })

    await flush(COMPLETED_HOLD_MS + 10)
    expect(result.current.state.outcome).toBeNull()
  })

  it('replaces a held outcome the moment a different attempt is watched', async () => {
    getAttemptOutcome.mockResolvedValueOnce({ state: 'completed', estimateId: 'e1' }).mockResolvedValue(pending)
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useAttemptProgress(id), {
      initialProps: { id: 'a1' as string | null },
    })
    await flush()
    rerender({ id: null })
    rerender({ id: 'a2' })
    await flush()
    expect(result.current.state.attemptId).toBe('a2')
    expect(result.current.state.outcome).toBeNull()
  })
})
