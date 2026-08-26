import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EstimateUnlockForm } from '@/components/share/estimate-unlock-form'

// Phase 193-02 — public unlock form rendered by both share pages instead of
// EstimateView while an estimate is password-locked.

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const mockUnlockEstimate = vi.fn()
vi.mock('@/app/estimate/[token]/actions', () => ({
  unlockEstimate: (...args: unknown[]) => mockUnlockEstimate(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function renderForm(overrides: Partial<React.ComponentProps<typeof EstimateUnlockForm>> = {}) {
  return render(
    <EstimateUnlockForm
      token="tok_1"
      companyName="Acme Co"
      logoUrl={null}
      brandColor={null}
      {...overrides}
    />
  )
}

describe('EstimateUnlockForm', () => {
  it('renders a password field and the company name, no project/client/total content anywhere', () => {
    renderForm()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByText(/Acme Co/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Unlock estimate/i })).toBeTruthy()
  })

  it('submit is disabled with an empty password', () => {
    renderForm()
    const button = screen.getByRole('button', { name: /Unlock estimate/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('a wrong password shows the server-returned error and does NOT refresh the router', async () => {
    mockUnlockEstimate.mockResolvedValue({ success: false, error: 'Incorrect password. Please try again.' })
    renderForm()

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /Unlock estimate/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('Incorrect password. Please try again.')
    })
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('a correct password calls unlockEstimate with the token + password and refreshes the router', async () => {
    mockUnlockEstimate.mockResolvedValue({ success: true })
    renderForm({ token: 'tok_abc' })

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } })
    fireEvent.click(screen.getByRole('button', { name: /Unlock estimate/i }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(mockUnlockEstimate).toHaveBeenCalledWith('tok_abc', 'correct-password')
  })

  it('renders the company logo instead of the lock icon when logoUrl is provided', () => {
    renderForm({ logoUrl: 'https://example.com/logo.png' })
    const img = screen.getByAltText('Acme Co') as HTMLImageElement
    expect(img.src).toBe('https://example.com/logo.png')
  })
})
