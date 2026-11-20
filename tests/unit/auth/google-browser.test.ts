import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  getApps: vi.fn(), initializeApp: vi.fn(), getAuth: vi.fn(), setPersistence: vi.fn(),
  language: vi.fn(), parameters: vi.fn(), popup: vi.fn(), token: vi.fn(),
}))
vi.mock('firebase/app', () => ({ getApps: sdk.getApps, initializeApp: sdk.initializeApp }))
vi.mock('firebase/auth', () => ({
  getAuth: sdk.getAuth, setPersistence: sdk.setPersistence, inMemoryPersistence: 'memory',
  GoogleAuthProvider: class { setCustomParameters = sdk.parameters }, signInWithPopup: sdk.popup,
}))

const config = { projectId: 'test', apiKey: 'public-test', authDomain: 'test.firebaseapp.com' }

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  sdk.getApps.mockReturnValue([])
  sdk.initializeApp.mockReturnValue({ name: 'xtimator-auth' })
  sdk.getAuth.mockReturnValue({ useDeviceLanguage: sdk.language })
  sdk.setPersistence.mockResolvedValue(undefined)
  sdk.token.mockResolvedValue('google-token')
  sdk.popup.mockResolvedValue({ user: { getIdToken: sdk.token } })
})

describe('Google popup preparation', () => {
  it('finishes initialization before exposing a handler that opens the popup immediately', async () => {
    let initialized!: () => void
    sdk.setPersistence.mockImplementationOnce(() => new Promise<void>(resolve => { initialized = resolve }))
    const { prepareGoogleIdentityLogin } = await import('@/lib/auth/google-browser')
    let ready = false
    const preparation = prepareGoogleIdentityLogin(config).then(login => { ready = true; return login })
    await vi.waitFor(() => expect(sdk.setPersistence).toHaveBeenCalled())
    expect(ready).toBe(false)
    expect(sdk.popup).not.toHaveBeenCalled()
    initialized()
    const login = await preparation
    expect(sdk.parameters).toHaveBeenCalledWith({ prompt: 'select_account' })
    expect(sdk.popup).not.toHaveBeenCalled()
    const token = login()
    expect(sdk.popup).toHaveBeenCalledTimes(1)
    expect(await token).toBe('google-token')
    expect(sdk.token).toHaveBeenCalledWith(true)
  })
  it('can retry preparation after initialization fails', async () => {
    sdk.setPersistence.mockRejectedValueOnce(new Error('Offline'))
    const { prepareGoogleIdentityLogin } = await import('@/lib/auth/google-browser')
    await expect(prepareGoogleIdentityLogin(config)).rejects.toThrow('Offline')
    const login = await prepareGoogleIdentityLogin(config)
    expect(await login()).toBe('google-token')
    expect(sdk.setPersistence).toHaveBeenCalledTimes(2)
  })
  it('propagates popup blocking to the form without starting a phone challenge', async () => {
    sdk.popup.mockRejectedValueOnce({ code: 'auth/popup-blocked' })
    const { prepareGoogleIdentityLogin } = await import('@/lib/auth/google-browser')
    const login = await prepareGoogleIdentityLogin(config)
    await expect(login()).rejects.toEqual({ code: 'auth/popup-blocked' })
    expect(sdk.token).not.toHaveBeenCalled()
  })
})
