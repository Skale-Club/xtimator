import { createRef } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ send: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), invalidate: vi.fn() }))
vi.mock('@/lib/auth/google-browser', async original => ({ ...await original<typeof import('@/lib/auth/google-browser')>(), requestPhoneCode: sdk.send, confirmPhoneCode: sdk.confirm, cancelPhoneChallenge: sdk.cancel }))
vi.mock('@/lib/auth/owned-browser', () => ({ invalidateOwnedBrowserSession: sdk.invalidate }))
vi.mock('@/components/ui/phone-input', () => ({ PhoneInput: ({ value, onChange, id }: { value: string; onChange: (value: string) => void; id: string }) => <input id={id} aria-label="Phone" value={value} onChange={event => onChange(event.target.value)} /> }))
import { PhoneStep, type PhoneStepHandle } from '@/components/onboarding/survey/steps/phone-step'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

const config = { projectId: 'test', apiKey: 'public-test', authDomain: 'test.firebaseapp.com' }
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks(); sdk.send.mockResolvedValue(undefined); sdk.confirm.mockResolvedValue('signed-phone-token')
  fetchMock = vi.fn(async (url: string) => url === '/api/auth/config' ? Response.json({ mode: 'owned', firebase: config }) : Response.json({ status: 'active', redirectTo: '/settings/account' }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function setup(phone: string, verifiedPhone: string | null = null) {
  const ref = createRef<PhoneStepHandle>()
  const values = { phone } as OnboardingValues
  const props = { setValue: vi.fn(), onNext: vi.fn(), onVerified: vi.fn() }
  render(<PhoneStep ref={ref} values={values} verifiedPhone={verifiedPhone} {...props} />)
  return { ref, ...props }
}

describe('onboarding phone step', () => {
  it('texts a code, verifies it on the signed-in account and moves on', async () => {
    const { ref, setValue, onNext, onVerified } = setup('+1 (508) 555-0100')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/config', expect.anything()))
    await act(async () => { ref.current!.next() })
    expect(sdk.send).toHaveBeenCalledWith(config, '+15085550100')
    fireEvent.change(await screen.findByLabelText('6-digit code'), { target: { value: '123456' } })
    await waitFor(() => expect(onNext).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/identity', expect.objectContaining({ body: JSON.stringify({ idToken: 'signed-phone-token', purpose: 'link' }) }))
    expect(setValue).toHaveBeenCalledWith('phone', '+15085550100')
    expect(onVerified).toHaveBeenCalledWith('+15085550100')
    expect(sdk.invalidate).toHaveBeenCalled()
  })
  it('moves on without a code when the number is already verified or left empty', async () => {
    const verified = setup('+1 (508) 555-0100', '+15085550100')
    act(() => verified.ref.current!.next())
    expect(verified.onNext).toHaveBeenCalledOnce()
    cleanup()
    const empty = setup('')
    act(() => empty.ref.current!.next())
    expect(empty.onNext).toHaveBeenCalledOnce()
    expect(sdk.send).not.toHaveBeenCalled()
  })
  it('says when the number already belongs to another account and stays on the step', async () => {
    fetchMock.mockImplementation(async (url: string) => url === '/api/auth/config' ? Response.json({ mode: 'owned', firebase: config }) : Response.json({ code: 'identity_conflict' }, { status: 409 }))
    const { ref, onNext } = setup('+1 (508) 555-0100')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/config', expect.anything()))
    await act(async () => { ref.current!.next() })
    fireEvent.change(await screen.findByLabelText('6-digit code'), { target: { value: '123456' } })
    expect((await screen.findByRole('alert')).textContent).toBe('This number is already used by another Xtimator account.')
    expect(onNext).not.toHaveBeenCalled()
  })
})
