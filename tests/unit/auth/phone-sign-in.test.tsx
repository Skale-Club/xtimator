import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ send: vi.fn(), confirm: vi.fn(), google: vi.fn(), cancel: vi.fn() }))
vi.mock('@/lib/auth/google-browser', async original => ({ ...await original<typeof import('@/lib/auth/google-browser')>(), requestPhoneCode: sdk.send, confirmPhoneCode: sdk.confirm, googleIdentityLogin: sdk.google, cancelPhoneChallenge: sdk.cancel }))
vi.mock('@/lib/auth/owned-browser', () => ({ invalidateOwnedBrowserSession: vi.fn() }))
vi.mock('@/components/ui/phone-input', () => ({ PhoneInput: ({ value, onChange, id, disabled }: { value: string; onChange: (value: string) => void; id: string; disabled: boolean }) => <input id={id} value={value} onChange={event => onChange(event.target.value)} disabled={disabled} /> }))
import { PhoneSignIn } from '@/components/auth/phone-sign-in'

const config = { projectId: 'test', apiKey: 'public-test', authDomain: 'test.firebaseapp.com' }
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks(); sdk.send.mockResolvedValue(undefined); sdk.confirm.mockResolvedValue('signed-phone-token'); sdk.google.mockResolvedValue('signed-google-token')
  fetchMock = vi.fn(async (url: string) => url === '/api/auth/config' ? Response.json({ mode: 'owned', firebase: config }) : Response.json({ code: 'auth_unavailable' }, { status: 503 }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('phone-first sign-in', () => {
  it('puts phone/SMS before secondary Google and requests no SMS until submitted', async () => {
    render(<PhoneSignIn />)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Send code' }) as HTMLButtonElement).disabled).toBe(false))
    const buttons = screen.getAllByRole('button')
    expect(buttons.indexOf(screen.getByRole('button', { name: 'Send code' }))).toBeLessThan(buttons.indexOf(screen.getByRole('button', { name: 'Continue with Google' })))
    expect(sdk.send).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+1 (508) 555-0100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await screen.findByLabelText('6-digit code')
    expect(sdk.send).toHaveBeenCalledWith(config, '+15085550100')
    expect(sdk.confirm).not.toHaveBeenCalled()
    // A full code submits itself, so the button never has to be found under the keyboard.
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/identity', expect.objectContaining({ body: JSON.stringify({ idToken: 'signed-phone-token', next: null, purpose: 'login' }) })))
    expect(sdk.confirm).toHaveBeenCalledTimes(1)
    expect(sdk.confirm).toHaveBeenCalledWith('+15085550100', '123456')
    expect(await screen.findByRole('alert')).toBeTruthy()
  })
  it('keeps unlinked Google on phone verification instead of inventing a logged-in session', async () => {
    fetchMock.mockImplementation(async (url: string) => Response.json(url === '/api/auth/config' ? { mode: 'owned', firebase: config } : { status: 'phone_required' }))
    render(<PhoneSignIn />)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Continue with Google' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    await screen.findByText('Verify your phone to finish linking your account.')
    expect(screen.getByLabelText('Phone number')).toBeTruthy()
  })
  it('hides account recovery until the server says an existing account needs it, never email/password login', async () => {
    fetchMock.mockImplementation(async (url: string) => url === '/api/auth/config' ? Response.json({ mode: 'owned', firebase: config }) : Response.json({ code: 'account_recovery_required' }, { status: 409 }))
    render(<PhoneSignIn />)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Continue with Google' }) as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByRole('button', { name: 'Recover existing account' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Recover existing account' }))
    expect(screen.getByLabelText('Account email')).toBeTruthy()
    expect(screen.queryByLabelText(/password/i)).toBeNull()
  })
})
