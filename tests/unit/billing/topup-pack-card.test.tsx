import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * Credits plan 2026-11-20 - TopUpPackCard.
 *
 * Supersedes the July 2026 CREDITFIX-01 guard ("never show a credit count"):
 * since SEED-055 credits are shown everywhere, and a pack now leads with its
 * credits, shows the range of estimates they usually cover, and carries the
 * price (always derived from priceCents) on its button.
 */

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

const { TopUpPackCard } = await import('@/components/billing/topup-pack-card')

describe('TopUpPackCard', () => {
  it('leads with the credits, shows the estimate range and the price on the button', () => {
    render(<TopUpPackCard packIndex={1} priceCents={2000} credits={1900} estimates={{ min: 12, max: 29 }} />)
    expect(screen.getByText('1,900')).toBeTruthy()
    expect(screen.getByText('credits')).toBeTruthy()
    expect(screen.getByText('12 to 29 estimates')).toBeTruthy()
    expect(screen.getByRole('button').textContent).toContain('Buy for $20')
  })

  it('a fractional price renders two decimals ("$20.50")', () => {
    const { container } = render(<TopUpPackCard packIndex={0} priceCents={2050} credits={1300} />)
    expect(container.innerHTML).toContain('$20.50')
  })

  it('shows "Best value" only when told to', () => {
    const { rerender } = render(<TopUpPackCard packIndex={2} priceCents={5000} credits={5000} bestValue />)
    expect(screen.getByText('Best value')).toBeTruthy()
    rerender(<TopUpPackCard packIndex={0} priceCents={1000} credits={900} />)
    expect(screen.queryByText('Best value')).toBeNull()
  })

  it('Buy opens the shared buy dialog with this pack selected', () => {
    const opened = vi.fn()
    window.addEventListener('xtm:buy-credits', opened)
    render(<TopUpPackCard packIndex={2} priceCents={5000} credits={5000} />)
    fireEvent.click(screen.getByRole('button'))
    expect(opened).toHaveBeenCalledTimes(1)
    expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({ packIndex: 2 })
    window.removeEventListener('xtm:buy-credits', opened)
  })

  it('a member (not the owner) cannot buy', () => {
    render(<TopUpPackCard packIndex={0} priceCents={1000} credits={900} isOwner={false} />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })
})
