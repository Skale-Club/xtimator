import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * TierCardsGrid — UX-audit regression guard.
 *
 * Covers:
 *  1. Default behavior is unchanged (currentInterval/isOwner/pendingCancel
 *     all default so nothing regresses for existing callers).
 *  2. Interval-aware `current`: a Pro-monthly customer viewing the Annual
 *     toggle sees an ENABLED "Switch to annual" CTA, not a disabled
 *     "Current plan" for a combination they can't buy.
 *  3. isOwner=false disables every actionable CTA and surfaces a hint,
 *     instead of leaving every purchase button clickable-but-403-forever
 *     for a non-owner member.
 *  4. pendingCancel=true turns the current tier's dead-end "Current plan"
 *     into an enabled "Resume subscription" that hits the portal session
 *     route (Stripe's cancel-reversal flow), not checkout.
 *  5. A distinct server error (data.error) is surfaced verbatim via
 *     toast.error instead of collapsing into the generic
 *     "Please try again." string.
 *
 * RTL `container`/plain-DOM-assertion style — no jest-dom matchers (not set
 * up globally in this suite; mirrors tests/unit/chat/chat-composer.test.tsx).
 */

vi.mock('@/components/i18n/t', () => ({
  T: ({ children, text }: { children?: string; text?: string }) => <>{text ?? children}</>,
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}))

const { TierCardsGrid } = await import('@/components/billing/tier-cards-grid')

beforeEach(() => {
  toastError.mockClear()
  vi.stubGlobal('fetch', vi.fn())
})

describe('TierCardsGrid — default behavior (no regression)', () => {
  it('renders the current tier as a disabled "Current plan" when currentInterval is unset', () => {
    render(<TierCardsGrid currentTier="pro" />)
    const btn = screen.getByRole('button', { name: 'Current plan' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})

describe('TierCardsGrid — interval-aware current (switch monthly<->annual)', () => {
  it('offers an enabled "Switch to annual" CTA instead of a disabled Current plan when the toggle differs from currentInterval', async () => {
    render(<TierCardsGrid currentTier="pro" currentInterval="month" />)

    // Still monthly → matches → disabled "Current plan"
    expect((screen.getByRole('button', { name: 'Current plan' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Annual' }))

    const switchBtn = screen.getByRole('button', { name: 'Switch to annual' }) as HTMLButtonElement
    expect(switchBtn.disabled).toBe(false)
    expect(screen.queryByRole('button', { name: 'Current plan' })).toBeNull()
  })

  it('posts the selected interval to checkout when the interval-switch CTA is clicked', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.example/session' }),
    })

    render(<TierCardsGrid currentTier="pro" currentInterval="month" />)
    fireEvent.click(screen.getByRole('button', { name: 'Annual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Switch to annual' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/billing/create-checkout-session',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ plan: 'pro', billingInterval: 'year' }),
      })
    ))
  })
})

describe('TierCardsGrid — isOwner', () => {
  it('disables non-owner CTAs and shows the owner-only hint', () => {
    render(<TierCardsGrid currentTier="free" isOwner={false} />)
    expect(screen.getByText('Only the company owner can manage billing.')).not.toBeNull()
    expect((screen.getByRole('button', { name: 'Upgrade to Pro' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Upgrade to Business' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not show the hint or disable CTAs when isOwner defaults to true', () => {
    render(<TierCardsGrid currentTier="free" />)
    expect(screen.queryByText('Only the company owner can manage billing.')).toBeNull()
    expect((screen.getByRole('button', { name: 'Upgrade to Pro' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('TierCardsGrid — pendingCancel', () => {
  it('offers an enabled "Resume subscription" CTA on the current tier when pendingCancel is true', () => {
    render(<TierCardsGrid currentTier="pro" pendingCancel />)
    const resumeBtn = screen.getByRole('button', { name: 'Resume subscription' }) as HTMLButtonElement
    expect(resumeBtn.disabled).toBe(false)
    expect(screen.queryByRole('button', { name: 'Current plan' })).toBeNull()
  })

  it('still renders a disabled "Current plan" when pendingCancel is false (default)', () => {
    render(<TierCardsGrid currentTier="pro" />)
    expect((screen.getByRole('button', { name: 'Current plan' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('resume CTA posts to the portal-session route, not checkout', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://billing.example/portal' }),
    })

    render(<TierCardsGrid currentTier="pro" pendingCancel />)
    fireEvent.click(screen.getByRole('button', { name: 'Resume subscription' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/billing/create-portal-session', { method: 'POST' })
    )
  })

  it('never offers Resume subscription for the free tier', () => {
    render(<TierCardsGrid currentTier="free" pendingCancel />)
    expect(screen.queryByRole('button', { name: 'Resume subscription' })).toBeNull()
  })
})

describe('TierCardsGrid — distinct server error passthrough', () => {
  it('surfaces data.error via toast.error instead of the generic message', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Already on this plan' }),
    })

    render(<TierCardsGrid currentTier="free" />)
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Already on this plan'))
  })

  it('falls back to the generic message on a network/parse failure (no data.error)', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'))

    render(<TierCardsGrid currentTier="free" />)
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro' }))

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Could not start checkout. Please try again.')
    )
  })
})
