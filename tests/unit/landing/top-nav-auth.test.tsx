import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopNavAuth } from '@/components/landing/top-nav-auth'

const auth = vi.hoisted(() => ({
  getUser: vi.fn<() => Promise<unknown>>(),
  onAuthStateChange: vi.fn<(listener: (event: string, session: null) => void) => unknown>(),
  unsubscribe: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth }) }))
vi.mock('@/lib/auth/sign-out', () => ({ signOut: vi.fn() }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))

const branding = { appName: 'Xtimator', logoUrl: null }
const serverUser = { email: 'qa-owner@example.invalid', avatarUrl: null }

function pendingSessionRead() {
  let reject!: (reason: Error) => void
  const read = new Promise<never>((_resolve, rejectRead) => { reject = rejectRead })
  auth.getUser.mockReturnValueOnce(read)
  return async () => {
    await act(async () => { reject(new TypeError('Session lookup was interrupted')) })
  }
}

describe('TopNavAuth session lookup failure', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: auth.unsubscribe } } })
  })

  it('keeps the anonymous Start action after a rejected lookup', async () => {
    const rejectRead = pendingSessionRead()
    const onOpenAuth = vi.fn()
    render(<TopNavAuth branding={branding} navUser={null} onOpenAuth={onOpenAuth} />)

    await rejectRead()

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(onOpenAuth).toHaveBeenCalledWith('signup')
  })

  it('preserves the server-rendered account identity after a rejected lookup', async () => {
    const rejectRead = pendingSessionRead()
    render(<TopNavAuth branding={branding} navUser={serverUser} />)

    await rejectRead()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Q' }), { key: 'ArrowDown' })
    expect(screen.getByText(serverUser.email)).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('still responds to a signed-out event after the lookup rejects', async () => {
    const rejectRead = pendingSessionRead()
    render(<TopNavAuth branding={branding} navUser={serverUser} />)

    await rejectRead()
    const listener = auth.onAuthStateChange.mock.calls[0][0]
    act(() => listener('SIGNED_OUT', null))

    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Q' })).not.toBeInTheDocument()
  })

  it('unsubscribes on unmount and handles a lookup that rejects afterwards', async () => {
    const rejectRead = pendingSessionRead()
    const view = render(<TopNavAuth branding={branding} navUser={serverUser} />)

    view.unmount()

    expect(auth.unsubscribe).toHaveBeenCalledTimes(1)
    await rejectRead()
  })
})
