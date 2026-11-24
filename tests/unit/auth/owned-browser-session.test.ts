import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createSupabaseClient } = vi.hoisted(() => ({
  createSupabaseClient: vi.fn<(_url: string, _key: string, options: {
    accessToken: () => Promise<string | null>
  }) => object>(() => ({})),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: createSupabaseClient }))
import { createOwnedBrowserClient, invalidateOwnedBrowserSession } from '@/lib/auth/owned-browser'

const snapshot = (id: string) => ({ user: { id }, accessToken: `test-token-${id}`, expiresAt: Date.now() + 300_000 })
const readDataToken = () => createSupabaseClient.mock.calls[0][2].accessToken()
const openBroadcastChannel = vi.fn()
const postBroadcastMessage = vi.fn()
let authBroadcastChannel: TestBroadcastChannel

class TestBroadcastChannel {
  onmessage: ((message: MessageEvent) => void) | null = null
  postMessage = postBroadcastMessage

  constructor(name: string) {
    openBroadcastChannel(name)
    authBroadcastChannel = this
  }
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  invalidateOwnedBrowserSession()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('BroadcastChannel', TestBroadcastChannel)
  postBroadcastMessage.mockClear()
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

  it('publishes a confirmed logout and removes the cached user and data token without a GET', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(snapshot('current')))
    const client = createOwnedBrowserClient()
    expect((await client.auth.getUser()).data.user?.id).toBe('current')
    expect(await readDataToken()).toBe('test-token-current')
    const onChange = vi.fn()
    const { data: { subscription } } = client.auth.onAuthStateChange(onChange)

    try {
      const originalChannel = authBroadcastChannel
      fetchMock.mockClear().mockResolvedValueOnce(Response.json({ success: true }))
      expect(await client.auth.signOut()).toEqual({ error: null })
      expect((await client.auth.getUser()).data.user).toBeNull()
      expect(await readDataToken()).toBeNull()
      expect(onChange).toHaveBeenCalledExactlyOnceWith('SIGNED_OUT', null)
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/auth/session', expect.objectContaining({ method: 'DELETE' }))
      expect(authBroadcastChannel).toBe(originalChannel)
      expect(openBroadcastChannel).toHaveBeenCalledExactlyOnceWith('xtimator-auth')
      expect(postBroadcastMessage).toHaveBeenCalledExactlyOnceWith('changed')
    } finally {
      subscription.unsubscribe()
    }
  })

  it.each(['resolve', 'reject'])('keeps a late %s from restoring identity or starting another read after confirmed logout', async outcome => {
    let resolve!: (response: Response) => void
    let reject!: (error: Error) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done, fail) => { resolve = done; reject = fail }))
    const client = createOwnedBrowserClient()
    const oldUser = client.auth.getUser()
    const oldToken = readDataToken()
    fetchMock.mockResolvedValueOnce(Response.json({ success: true }))
    expect(await client.auth.signOut()).toEqual({ error: null })

    if (outcome === 'resolve') resolve(Response.json(snapshot('old-account')))
    else reject(new Error('Old request was interrupted'))

    const [user, token] = await Promise.all([oldUser, oldToken])
    expect(user.data.user).toBeNull()
    expect(token).toBeNull()
    expect(await readDataToken()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/session', expect.objectContaining({ method: 'DELETE' }))
  })

  it('preserves the existing identity and does not announce logout when DELETE fails', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(snapshot('current')))
    const client = createOwnedBrowserClient()
    await client.auth.getUser()
    const onChange = vi.fn()
    const { data: { subscription } } = client.auth.onAuthStateChange(onChange)

    try {
      fetchMock.mockClear().mockResolvedValueOnce(Response.json({ success: false }, { status: 503 }))
      expect((await client.auth.signOut()).error).toBeTruthy()
      expect((await client.auth.getUser()).data.user?.id).toBe('current')
      expect(await readDataToken()).toBe('test-token-current')
      expect(onChange).not.toHaveBeenCalled()
      expect(postBroadcastMessage).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/auth/session', expect.objectContaining({ method: 'DELETE' }))
    } finally {
      subscription.unsubscribe()
    }
  })

  it('bounds an unanswered logout request and preserves identity for retry', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(Response.json(snapshot('current')))
    const client = createOwnedBrowserClient()
    await client.auth.getUser()
    fetchMock.mockImplementationOnce((_url, options) => new Promise<Response>((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))

    const pending = expect(client.auth.signOut()).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(15_000)
    await pending

    expect((await client.auth.getUser()).data.user?.id).toBe('current')
    expect(await readDataToken()).toBe('test-token-current')
    expect(postBroadcastMessage).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['xtimator:auth', 'focus', 'broadcast'])('refreshes the authoritative anonymous cache on a later %s event', async eventName => {
    const client = createOwnedBrowserClient()
    fetchMock.mockResolvedValueOnce(Response.json({ success: true }))
    expect(await client.auth.signOut()).toEqual({ error: null })
    expect((await client.auth.getUser()).data.user).toBeNull()
    const onChange = vi.fn()
    const { data: { subscription } } = client.auth.onAuthStateChange(onChange)

    try {
      fetchMock.mockClear().mockResolvedValueOnce(Response.json(snapshot('signed-back-in')))
      if (eventName === 'broadcast') {
        authBroadcastChannel.onmessage?.(new MessageEvent('message', {
          data: { user: { id: 'untrusted-message' }, accessToken: 'untrusted-message-token' },
        }))
      } else {
        window.dispatchEvent(new Event(eventName))
      }
      expect((await client.auth.getUser()).data.user?.id).toBe('signed-back-in')
      expect(await readDataToken()).toBe('test-token-signed-back-in')
      expect(onChange).toHaveBeenCalledExactlyOnceWith('SIGNED_IN', { user: { id: 'signed-back-in' } })
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/auth/session', expect.objectContaining({ cache: 'no-store' }))
    } finally {
      subscription.unsubscribe()
    }
  })
})
