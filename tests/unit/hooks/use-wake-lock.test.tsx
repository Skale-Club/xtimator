/**
 * hooks/use-wake-lock.ts — screen wake lock lifecycle.
 *
 * The bug this guards: the phone screen blanked mid-recording (and on the
 * "generating estimate" wait), which on iOS suspends the page and can lose
 * the take. The three behaviors that actually matter in production are:
 * acquire while active, RE-acquire after the browser's automatic release on
 * hide (a single tab switch used to lose the lock for good), and release on
 * unmount so an aborted flow can't pin the screen on forever.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWakeLock, isWakeLockSupported } from '@/hooks/use-wake-lock'

interface FakeSentinel {
  released: boolean
  release: () => Promise<void>
}

function installWakeLock() {
  const sentinels: FakeSentinel[] = []
  const request = vi.fn(async () => {
    const sentinel: FakeSentinel = {
      released: false,
      release: vi.fn(async () => {
        sentinel.released = true
      }),
    }
    sentinels.push(sentinel)
    return sentinel
  })
  Object.defineProperty(navigator, 'wakeLock', {
    value: { request },
    configurable: true,
    writable: true,
  })
  return { request, sentinels }
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

// The hook's acquire is async; flush the microtask queue so the sentinel is
// stored before assertions run.
const flush = () => act(async () => { await Promise.resolve() })

describe('useWakeLock', () => {
  beforeEach(() => {
    setVisibility('visible')
  })

  afterEach(() => {
    // @ts-expect-error — cleaning up the injected test double
    delete navigator.wakeLock
  })

  it('acquires a screen wake lock while active', async () => {
    const { request } = installWakeLock()
    renderHook(() => useWakeLock(true))
    await flush()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('screen')
  })

  it('does not acquire while inactive', async () => {
    const { request } = installWakeLock()
    renderHook(() => useWakeLock(false))
    await flush()

    expect(request).not.toHaveBeenCalled()
  })

  it('releases when the flag flips to inactive', async () => {
    const { sentinels } = installWakeLock()
    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    })
    await flush()
    expect(sentinels[0].released).toBe(false)

    rerender({ active: false })
    await flush()
    expect(sentinels[0].released).toBe(true)
  })

  it('releases on unmount so an aborted flow cannot pin the screen on', async () => {
    const { sentinels } = installWakeLock()
    const { unmount } = renderHook(() => useWakeLock(true))
    await flush()

    unmount()
    await flush()
    expect(sentinels[0].released).toBe(true)
  })

  it('re-acquires after the browser auto-releases on hide', async () => {
    const { request, sentinels } = installWakeLock()
    renderHook(() => useWakeLock(true))
    await flush()
    expect(request).toHaveBeenCalledTimes(1)

    // The browser revokes the lock when the document is hidden — model that by
    // flipping `released` the way a real sentinel does.
    sentinels[0].released = true
    act(() => setVisibility('hidden'))
    await flush()
    // Still 1: a hidden document can't hold a lock, and request() would reject.
    expect(request).toHaveBeenCalledTimes(1)

    act(() => setVisibility('visible'))
    await flush()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not stack locks when the page becomes visible with a live sentinel', async () => {
    const { request } = installWakeLock()
    renderHook(() => useWakeLock(true))
    await flush()

    act(() => setVisibility('visible'))
    await flush()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('is a silent no-op when the API is unsupported (iOS < 16.4)', async () => {
    // @ts-expect-error — simulating a browser without the API
    delete navigator.wakeLock
    expect(isWakeLockSupported()).toBe(false)

    const { unmount } = renderHook(() => useWakeLock(true))
    await flush()
    expect(() => unmount()).not.toThrow()
  })

  it('survives a rejected request (battery saver / permissions policy)', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: vi.fn(async () => { throw new Error('NotAllowedError') }) },
      configurable: true,
      writable: true,
    })

    const { unmount } = renderHook(() => useWakeLock(true))
    await flush()
    expect(() => unmount()).not.toThrow()
  })
})
