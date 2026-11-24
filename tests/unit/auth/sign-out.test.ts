// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OWNED_SIGN_OUT_FAILED, OWNED_SIGN_OUT_STARTED } from '@/lib/auth/browser-events'
import { signOut } from '@/lib/auth/sign-out'

const mocks = vi.hoisted(() => ({
  ownedAuthEnabled: vi.fn<() => boolean>(),
  createClient: vi.fn(),
  ownedSignOut: vi.fn<() => Promise<{ error: { message: string } | null }>>(),
  legacySignOut: vi.fn<() => Promise<void>>(),
  toastError: vi.fn(),
}))

vi.mock('@/lib/auth/mode', () => ({ ownedAuthEnabled: mocks.ownedAuthEnabled }))
vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/actions/auth', () => ({ signOut: mocks.legacySignOut }))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

const assign = vi.fn()
const openBroadcastChannel = vi.fn()
const dispatchEvent = vi.fn<(_event: Event) => boolean>(() => true)

function dispatchedEvents() {
  return dispatchEvent.mock.calls.map(([event]) => event.type)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('window', { location: { assign }, dispatchEvent })
  vi.stubGlobal('BroadcastChannel', openBroadcastChannel)
  mocks.ownedAuthEnabled.mockReturnValue(true)
  mocks.createClient.mockReturnValue({ auth: { signOut: mocks.ownedSignOut } })
})

afterEach(() => { vi.unstubAllGlobals() })

describe('signOut', () => {
  it('navigates exactly once after an owned logout succeeds', async () => {
    mocks.ownedSignOut.mockResolvedValueOnce({ error: null })

    await signOut()

    expect(mocks.ownedSignOut).toHaveBeenCalledOnce()
    expect(dispatchedEvents()).toEqual([OWNED_SIGN_OUT_STARTED])
    expect(dispatchEvent.mock.invocationCallOrder[0]).toBeLessThan(mocks.ownedSignOut.mock.invocationCallOrder[0])
    expect(assign).toHaveBeenCalledExactlyOnceWith('/')
    expect(openBroadcastChannel).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.legacySignOut).not.toHaveBeenCalled()
  })

  it.each(['response error', 'network rejection'])('shows a generic error and stays on the page after a %s', async failure => {
    if (failure === 'response error') {
      mocks.ownedSignOut.mockResolvedValueOnce({ error: { message: 'Internal service detail' } })
    } else {
      mocks.ownedSignOut.mockRejectedValueOnce(new TypeError('Internal network detail'))
    }

    await expect(signOut()).resolves.toBeUndefined()

    expect(mocks.ownedSignOut).toHaveBeenCalledOnce()
    expect(dispatchedEvents()).toEqual([OWNED_SIGN_OUT_STARTED, OWNED_SIGN_OUT_FAILED])
    expect(dispatchEvent.mock.invocationCallOrder[0]).toBeLessThan(mocks.ownedSignOut.mock.invocationCallOrder[0])
    expect(dispatchEvent.mock.invocationCallOrder[1]).toBeGreaterThan(mocks.ownedSignOut.mock.invocationCallOrder[0])
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith('Sign out failed. Please try again.')
    expect(assign).not.toHaveBeenCalled()
    expect(openBroadcastChannel).not.toHaveBeenCalled()
    expect(mocks.legacySignOut).not.toHaveBeenCalled()
  })

  it('delegates legacy logout and lets its redirect propagate', async () => {
    mocks.ownedAuthEnabled.mockReturnValue(false)
    const redirect = new Error('NEXT_REDIRECT')
    mocks.legacySignOut.mockRejectedValueOnce(redirect)

    await expect(signOut()).rejects.toBe(redirect)

    expect(mocks.legacySignOut).toHaveBeenCalledOnce()
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(dispatchEvent).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
