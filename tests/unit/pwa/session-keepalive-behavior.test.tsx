import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ router: { refresh: vi.fn() }, invalidate: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/lib/auth/owned-browser', () => ({ invalidateOwnedBrowserSession: mocks.invalidate }))
import { SessionKeepalive } from '@/components/pwa/session-keepalive'

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, loggedIn: true }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('PWA session recovery', () => {
  it.each([true, false])('refreshes server authority for a verified loggedIn=%s response', async loggedIn => {
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true, loggedIn }))
    render(<SessionKeepalive />)
    await waitFor(() => expect(mocks.router.refresh).toHaveBeenCalledOnce())
    expect(mocks.invalidate).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/keepalive', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store', signal: expect.any(AbortSignal) }))
    act(() => { window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
    expect(fetchMock).toHaveBeenCalledOnce()
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
    const view = render(<SessionKeepalive />)
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    view.unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => { resolve(Response.json({ ok: true, loggedIn: false })) })
    expect(mocks.router.refresh).not.toHaveBeenCalled()
    expect(mocks.invalidate).not.toHaveBeenCalled()
    act(() => window.dispatchEvent(new Event('online')))
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
