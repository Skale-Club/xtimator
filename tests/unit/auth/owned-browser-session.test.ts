import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
import { createOwnedBrowserClient, invalidateOwnedBrowserSession } from '@/lib/auth/owned-browser'

const snapshot = (id: string) => ({ user: { id }, accessToken: `test-token-${id}`, expiresAt: Date.now() + 300_000 })
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  invalidateOwnedBrowserSession()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('BroadcastChannel', undefined)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('owned browser session consistency', () => {
  it('shares one pending read for concurrent callers', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(snapshot('current')))
    const client = createOwnedBrowserClient()
    const [first, second] = await Promise.all([client.auth.getUser(), client.auth.getUser()])
    expect(first.data.user?.id).toBe('current')
    expect(second.data.user?.id).toBe('current')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it.each(['resolve', 'reject'])('ignores a stale %s after logout or account switch', async outcome => {
    let resolve!: (response: Response) => void
    let reject!: (error: Error) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done, fail) => { resolve = done; reject = fail }))
    const client = createOwnedBrowserClient()
    const oldRead = client.auth.getUser()
    invalidateOwnedBrowserSession()
    fetchMock.mockResolvedValueOnce(Response.json(snapshot('new-account')))
    expect((await client.auth.getUser()).data.user?.id).toBe('new-account')
    if (outcome === 'resolve') resolve(Response.json(snapshot('old-account')))
    else reject(new Error('Old request failed'))
    expect((await oldRead).data.user?.id).toBe('new-account')
    expect((await client.auth.getUser()).data.user?.id).toBe('new-account')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('bounds a stalled session read and can retry without inventing a signed-out state', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('Aborted')))
    }))
    const client = createOwnedBrowserClient()
    const pending = expect(client.auth.getUser()).rejects.toThrow('Aborted')
    await vi.advanceTimersByTimeAsync(15_000)
    await pending
    fetchMock.mockResolvedValueOnce(Response.json(snapshot('still-signed-in')))
    expect((await client.auth.getUser()).data.user?.id).toBe('still-signed-in')
  })
})
