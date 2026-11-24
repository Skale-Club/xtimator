import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OWNED_SIGN_OUT_FAILED, OWNED_SIGN_OUT_STARTED } from '@/lib/auth/browser-events'

const mocks = vi.hoisted(() => ({ router: { refresh: vi.fn() }, invalidate: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/lib/auth/owned-browser', () => ({ invalidateOwnedBrowserSession: mocks.invalidate }))
import { SessionKeepalive } from '@/components/pwa/session-keepalive'

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  fetchMock = vi.fn().mockImplementation(async () => Response.json({ ok: true, loggedIn: true }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('PWA session recovery', () => {
  it.each([true, false])('checks an initial loggedIn=%s response and refreshes the route only if signed out', async loggedIn => {
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true, loggedIn }))
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    render(<SessionKeepalive />)

    await act(async () => {})

    expect(mocks.invalidate).toHaveBeenCalledOnce()
    expect(dispatch.mock.calls.filter(([event]) => event.type === 'xtimator:auth')).toHaveLength(1)
    expect(mocks.router.refresh).toHaveBeenCalledTimes(loggedIn ? 0 : 1)
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/auth/keepalive', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store', signal: expect.any(AbortSignal) }))
  })

  it.each([
    { eventName: 'focus', bypassThrottle: false },
    { eventName: 'pageshow', bypassThrottle: false },
    { eventName: 'visibilitychange', bypassThrottle: false },
    { eventName: 'online', bypassThrottle: true },
    { eventName: 'persisted pageshow', bypassThrottle: true },
  ])('refreshes the route after $eventName confirms the user is still signed in', async ({ eventName, bypassThrottle }) => {
    vi.useFakeTimers()
    render(<SessionKeepalive />)
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(mocks.invalidate).toHaveBeenCalledOnce()
    expect(mocks.router.refresh).not.toHaveBeenCalled()

    const comeToForeground = () => {
      if (eventName === 'persisted pageshow') {
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
      } else {
        const target = eventName === 'visibilitychange' ? document : window
        target.dispatchEvent(new Event(eventName))
      }
    }

    if (!bypassThrottle) {
      await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000 - 1) })
      act(comeToForeground)
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(mocks.router.refresh).not.toHaveBeenCalled()
      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    }

    await act(async () => { comeToForeground() })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mocks.invalidate).toHaveBeenCalledTimes(2)
    expect(mocks.router.refresh).toHaveBeenCalledOnce()
  })

  it.each([
    () => Promise.reject(new Error('Offline')),
    () => Promise.resolve(Response.json({ ok: true, loggedIn: false }, { status: 503 })),
    () => Promise.resolve(Response.json({ loggedIn: false })),
  ])('does not sign out on network, server or malformed response failure', async failure => {
    fetchMock.mockImplementationOnce(failure)
    render(<SessionKeepalive />)
    await act(async () => {})
    expect(mocks.router.refresh).not.toHaveBeenCalled()
    expect(mocks.invalidate).not.toHaveBeenCalled()
    act(() => window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(mocks.router.refresh).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('bounds a stalled request and retries when the connection returns', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce(() => new Promise(() => {}))
    render(<SessionKeepalive />)
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(signal.aborted).toBe(true)
    expect(mocks.router.refresh).not.toHaveBeenCalled()
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mocks.router.refresh).toHaveBeenCalledOnce()
  })

  it('aborts on unmount and ignores a late successful result', async () => {
    let resolve!: (response: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
    const addListener = vi.spyOn(window, 'addEventListener')
    const removeListener = vi.spyOn(window, 'removeEventListener')
    const view = render(<SessionKeepalive />)
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    const signOutEvents: readonly string[] = [OWNED_SIGN_OUT_STARTED, OWNED_SIGN_OUT_FAILED]
    const signOutListeners = addListener.mock.calls.filter(([event]) => signOutEvents.includes(event))
    expect(signOutListeners.map(([event]) => event).sort()).toEqual([...signOutEvents].sort())
    view.unmount()
    expect(signal.aborted).toBe(true)
    for (const listener of signOutListeners) expect(removeListener).toHaveBeenCalledWith(...listener)
    await act(async () => { resolve(Response.json({ ok: true, loggedIn: false })) })
    expect(mocks.router.refresh).not.toHaveBeenCalled()
    expect(mocks.invalidate).not.toHaveBeenCalled()
    act(() => window.dispatchEvent(new Event('online')))
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('cancels an in-flight check at logout start and ignores a late successful reply and foreground events', async () => {
    let resolve!: (response: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
    const authChange = vi.fn()
    window.addEventListener('xtimator:auth', authChange)

    try {
      render(<SessionKeepalive />)
      const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
      act(() => window.dispatchEvent(new Event(OWNED_SIGN_OUT_STARTED)))
      expect(signal.aborted).toBe(true)

      await act(async () => { resolve(Response.json({ ok: true, loggedIn: false })) })
      await act(async () => {
        window.dispatchEvent(new Event('online'))
        window.dispatchEvent(new Event('pageshow'))
        window.dispatchEvent(new Event('focus'))
        document.dispatchEvent(new Event('visibilitychange'))
      })

      expect(fetchMock).toHaveBeenCalledOnce()
      expect(mocks.invalidate).not.toHaveBeenCalled()
      expect(authChange).not.toHaveBeenCalled()
      expect(mocks.router.refresh).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('xtimator:auth', authChange)
    }
  })

  it.each(['failed logout', 'BFCache restore'])('starts a fresh check after %s while the cancelled check is still pending', async recovery => {
    let resolveOld!: (response: Response) => void
    let resolveNew!: (response: Response) => void
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>(done => { resolveOld = done }))
      .mockImplementationOnce(() => new Promise<Response>(done => { resolveNew = done }))
    const authChange = vi.fn()
    window.addEventListener('xtimator:auth', authChange)

    try {
      render(<SessionKeepalive />)
      const oldSignal = fetchMock.mock.calls[0][1].signal as AbortSignal
      act(() => window.dispatchEvent(new Event(OWNED_SIGN_OUT_STARTED)))
      expect(oldSignal.aborted).toBe(true)

      if (recovery === 'failed logout') {
        act(() => window.dispatchEvent(new Event(OWNED_SIGN_OUT_FAILED)))
        expect(fetchMock).toHaveBeenCalledOnce()
        act(() => window.dispatchEvent(new Event('focus')))
      } else {
        act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
      }
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/keepalive', expect.objectContaining({ method: 'GET' }))
      const newSignal = fetchMock.mock.calls[1][1].signal as AbortSignal
      expect(newSignal).not.toBe(oldSignal)
      expect(newSignal.aborted).toBe(false)

      // Simulate a transport that returned the old response despite the abort.
      await act(async () => { resolveOld(Response.json({ ok: true, loggedIn: false })) })
      expect(mocks.invalidate).not.toHaveBeenCalled()
      expect(authChange).not.toHaveBeenCalled()
      expect(mocks.router.refresh).not.toHaveBeenCalled()

      // Online bypasses the time throttle, so only the in-flight guard prevents a third request.
      act(() => window.dispatchEvent(new Event('online')))
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(newSignal.aborted).toBe(false)

      await act(async () => { resolveNew(Response.json({ ok: true, loggedIn: false })) })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(mocks.invalidate).toHaveBeenCalledOnce()
      expect(authChange).toHaveBeenCalledOnce()
      expect(mocks.router.refresh).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener('xtimator:auth', authChange)
    }
  })
})
