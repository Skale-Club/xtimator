import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SharePasswordControl } from '@/components/workspace/send/send-hub-dialog'

// Phase 193-02 — owner-side set/remove password toggle, rendered inline in
// SendHubDialog next to the copy-link control (see send-hub-dialog.test.tsx
// for the source-contract coverage of its placement/wiring).

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const mockSetEstimateSharePassword = vi.fn()
vi.mock('@/lib/actions/estimate', () => ({
  logDeliveryAction: vi.fn(),
  setEstimateSharePassword: (...args: unknown[]) => mockSetEstimateSharePassword(...args),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SharePasswordControl', () => {
  it('unprotected: shows "Anyone with the link can view" and a "Protect with password" toggle', () => {
    render(<SharePasswordControl estimateId="est_1" initiallyProtected={false} />)
    expect(screen.getByText('Anyone with the link can view')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Protect with password' })).toBeTruthy()
  })

  it('protected: shows "Password protected" and a "Remove" button, no set-password field', () => {
    render(<SharePasswordControl estimateId="est_1" initiallyProtected />)
    expect(screen.getByText('Password protected')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy()
    expect(screen.queryByPlaceholderText('Set a password')).toBeNull()
  })

  it('setting a password: calls setEstimateSharePassword, flips to protected, and refreshes the router', async () => {
    mockSetEstimateSharePassword.mockResolvedValue({ success: true })
    render(<SharePasswordControl estimateId="est_1" initiallyProtected={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Protect with password' }))
    fireEvent.change(screen.getByPlaceholderText('Set a password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByText('Password protected')).toBeTruthy())
    expect(mockSetEstimateSharePassword).toHaveBeenCalledWith('est_1', 'secret123')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('the Save button stays disabled below the 4-char minimum', () => {
    render(<SharePasswordControl estimateId="est_1" initiallyProtected={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Protect with password' }))
    fireEvent.change(screen.getByPlaceholderText('Set a password'), { target: { value: 'ab' } })
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('a failed set shows the returned error and does NOT flip to protected', async () => {
    mockSetEstimateSharePassword.mockResolvedValue({ success: false, error: 'Failed to update the estimate password.' })
    render(<SharePasswordControl estimateId="est_1" initiallyProtected={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Protect with password' }))
    fireEvent.change(screen.getByPlaceholderText('Set a password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByText('Failed to update the estimate password.')).toBeTruthy())
    expect(screen.getByText('Anyone with the link can view')).toBeTruthy()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('removing a password: calls setEstimateSharePassword(id, null) and flips back to unprotected', async () => {
    mockSetEstimateSharePassword.mockResolvedValue({ success: true })
    render(<SharePasswordControl estimateId="est_1" initiallyProtected />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.getByText('Anyone with the link can view')).toBeTruthy())
    expect(mockSetEstimateSharePassword).toHaveBeenCalledWith('est_1', null)
    expect(mockRefresh).toHaveBeenCalled()
  })
})
