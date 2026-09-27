import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'

/**
 * 260927: estimates the operator walked away from.
 *
 * Closing the New Xtimate popup mid-generation used to unmount the only thing
 * watching the journal, so a finished estimate was announced to nobody. These
 * tests pin the store that remembers the attempt and the app-shell watcher
 * that announces its outcome.
 */

const push = vi.fn()
const refresh = vi.fn()
let pathname = '/projects'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => pathname,
}))

const toastSuccess = vi.fn()
const toastInfo = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    info: (...a: unknown[]) => toastInfo(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

vi.mock('@/lib/i18n/use-translation', () => ({
  useAppTranslation: () => ({ t: (k: string) => `__t(${k})__`, language: 'en' }),
}))

const getAttemptOutcome = vi.fn()
vi.mock('@/lib/actions/attempt-outcome', () => ({
  getAttemptOutcome: (id: string) => getAttemptOutcome(id),
}))

import {
  MAX_AGE_MS,
  addBackgroundGeneration,
  listBackgroundGenerations,
  removeBackgroundGeneration,
} from '@/lib/estimate/background-generations'
import {
  BACKGROUND_POLL_MS,
  UNAUTHORIZED_DROP_AFTER,
  BackgroundGenerationWatcher,
} from '@/components/capture/background-generation-watcher'

const NOW = Date.parse('2026-09-27T12:00:00Z')

function entry(attemptId: string, projectId = 'p1', sinceMs = NOW) {
  return { attemptId, projectId, projectName: 'Smith Kitchen', since: new Date(sinceMs).toISOString() }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  pathname = '/projects'
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('background generations store', () => {
  it('remembers an attempt and forgets it once removed', () => {
    addBackgroundGeneration(entry('a1'))
    expect(listBackgroundGenerations(NOW).map((e) => e.attemptId)).toEqual(['a1'])
    removeBackgroundGeneration('a1')
    expect(listBackgroundGenerations(NOW)).toEqual([])
  })

  it('does not duplicate an attempt handed off twice (Continue button, then unmount)', () => {
    addBackgroundGeneration(entry('a1'))
    addBackgroundGeneration(entry('a1'))
    expect(listBackgroundGenerations(NOW)).toHaveLength(1)
  })

  it('drops entries older than the expiry window', () => {
    addBackgroundGeneration(entry('old', 'p1', NOW - MAX_AGE_MS - 1))
    addBackgroundGeneration(entry('new', 'p2', NOW))
    expect(listBackgroundGenerations(NOW).map((e) => e.attemptId)).toEqual(['new'])
  })

  it('survives corrupt storage instead of throwing', () => {
    localStorage.setItem('xtimator:background-generations', '{not json')
    expect(listBackgroundGenerations(NOW)).toEqual([])
  })

  it('returns a stable snapshot while nothing changes (useSyncExternalStore contract)', () => {
    addBackgroundGeneration(entry('a1'))
    expect(listBackgroundGenerations(NOW)).toBe(listBackgroundGenerations(NOW))
  })
})

describe('BackgroundGenerationWatcher', () => {
  async function tick() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKGROUND_POLL_MS)
    })
  }

  it('announces a finished estimate with a button that opens it, and stops watching', async () => {
    addBackgroundGeneration(entry('a1'))
    getAttemptOutcome.mockResolvedValue({ state: 'completed', estimateId: 'e9' })
    render(<BackgroundGenerationWatcher />)
    await tick()

    expect(toastSuccess).toHaveBeenCalledTimes(1)
    const [title, opts] = toastSuccess.mock.calls[0] as [string, { description: string; action: { onClick: () => void } }]
    expect(title).toBe('__t(Estimate ready)__')
    expect(opts.description).toBe('Smith Kitchen')
    opts.action.onClick()
    expect(push).toHaveBeenCalledWith('/projects/p1?tab=estimate&estimate=e9')
    expect(listBackgroundGenerations(NOW)).toEqual([])

    await tick()
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('refreshes the page instead of toasting when the operator is already looking at that project', async () => {
    pathname = '/projects/p1'
    addBackgroundGeneration(entry('a1'))
    getAttemptOutcome.mockResolvedValue({ state: 'completed', estimateId: 'e9' })
    render(<BackgroundGenerationWatcher />)
    await tick()
    expect(refresh).toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(listBackgroundGenerations(NOW)).toEqual([])
  })

  it('keeps watching while the journal says pending', async () => {
    addBackgroundGeneration(entry('a1'))
    getAttemptOutcome.mockResolvedValue({ state: 'pending', lastStep: 'generate_estimate', lastStatus: 'started', completedSteps: [], activeStepStartedAt: null })
    render(<BackgroundGenerationWatcher />)
    await tick()
    await tick()
    expect(getAttemptOutcome.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(listBackgroundGenerations(NOW)).toHaveLength(1)
  })

  it('says so when the estimate needs details or failed', async () => {
    addBackgroundGeneration(entry('vague', 'p1'))
    addBackgroundGeneration(entry('broken', 'p2'))
    getAttemptOutcome.mockImplementation(async (id: string) =>
      id === 'vague' ? { state: 'needs_details' } : { state: 'failed', step: 'generate_estimate', reason: 'x' }
    )
    render(<BackgroundGenerationWatcher />)
    await tick()
    expect(toastInfo).toHaveBeenCalledWith('__t(The estimate needs more details)__', expect.anything())
    expect(toastError).toHaveBeenCalledWith('__t(Estimate generation failed)__', expect.anything())
    expect(listBackgroundGenerations(NOW)).toEqual([])
  })

  it('does not poll at all when nothing runs in the background', async () => {
    render(<BackgroundGenerationWatcher />)
    await tick()
    expect(getAttemptOutcome).not.toHaveBeenCalled()
  })

  it('drops an attempt that is repeatedly not this account\'s, without announcing it', async () => {
    addBackgroundGeneration(entry('foreign'))
    getAttemptOutcome.mockResolvedValue({ state: 'unauthorized' })
    render(<BackgroundGenerationWatcher />)
    for (let i = 0; i < UNAUTHORIZED_DROP_AFTER; i++) await tick()
    expect(listBackgroundGenerations(NOW)).toEqual([])
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('forgives a single unauthorized blip', async () => {
    addBackgroundGeneration(entry('a1'))
    getAttemptOutcome
      .mockResolvedValueOnce({ state: 'unauthorized' })
      .mockResolvedValue({ state: 'pending', lastStep: 'transcribe', lastStatus: 'started', completedSteps: [], activeStepStartedAt: null })
    render(<BackgroundGenerationWatcher />)
    await tick()
    await tick()
    expect(listBackgroundGenerations(NOW)).toHaveLength(1)
  })
})
