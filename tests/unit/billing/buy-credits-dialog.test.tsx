import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

/**
 * Credits plan 2026-11-20 - the shared buy dialog: opens on openBuyCredits(),
 * shows the packs (credits, estimate range, best value, price) and the saved
 * card, buys in one click and announces the purchase; a Checkout answer
 * redirects.
 */

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
const T = (s: string) => s
vi.mock('@/lib/i18n/use-translation', () => ({ useTranslation: () => ({ t: T }) }))
const toastSuccess = vi.fn()
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() }) }))

const { BuyCreditsProvider, openBuyCredits, CREDITS_PURCHASED_EVENT } = await import('@/components/billing/buy-credits')

const OFFER = {
  eligible: true,
  balance: 120,
  expiryMonths: 3,
  defaultIndex: 1,
  card: { brand: 'Visa', last4: '4242' },
  packs: [
    { index: 0, credits: 900, priceCents: 1000, currency: 'usd', estimates: { min: 6, max: 13 }, bestValue: false },
    { index: 1, credits: 1900, priceCents: 2000, currency: 'usd', estimates: { min: 12, max: 29 }, bestValue: false },
    { index: 2, credits: 5000, priceCents: 5000, currency: 'usd', estimates: { min: 33, max: 76 }, bestValue: true },
  ],
}

const fetchMock = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? new Response(JSON.stringify({ mode: 'charged', credits: 5000, balance: 5120 }), { status: 200 })
      : new Response(JSON.stringify(OFFER), { status: 200 })
  )
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

describe('BuyCreditsProvider', () => {
  it('opens with the middle pack selected and the subscription card', async () => {
    render(<BuyCreditsProvider />)
    act(() => openBuyCredits())
    expect(await screen.findByTestId('buy-credits-picker')).toBeTruthy()
    expect(screen.getAllByTestId('buy-credits-pack')[1].getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Visa •••• 4242')).toBeTruthy()
    expect(screen.getByText('Best value')).toBeTruthy()
    expect(screen.getByTestId('buy-credits-submit').textContent).toBe('Buy 1,900 credits — $20')
  })

  it('buys the chosen pack in one click and announces it', async () => {
    const purchased = vi.fn()
    window.addEventListener(CREDITS_PURCHASED_EVENT, purchased)
    render(<BuyCreditsProvider />)
    act(() => openBuyCredits())
    await screen.findByTestId('buy-credits-picker')
    fireEvent.click(screen.getAllByTestId('buy-credits-pack')[2])
    fireEvent.click(screen.getByTestId('buy-credits-submit'))
    await waitFor(() => expect(purchased).toHaveBeenCalledTimes(1))
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(post[1].body)).toMatchObject({ packIndex: 2, useOtherCard: false })
    expect((purchased.mock.calls[0][0] as CustomEvent).detail).toEqual({ credits: 5000, balance: 5120 })
    expect(toastSuccess).toHaveBeenCalledWith('{credits} credits added'.replace('{credits}', '5,000'), expect.anything())
    expect(refresh).toHaveBeenCalled()
    window.removeEventListener(CREDITS_PURCHASED_EVENT, purchased)
  })

  it('preselects the pack the billing page asked for', async () => {
    render(<BuyCreditsProvider />)
    act(() => openBuyCredits({ packIndex: 0 }))
    await screen.findByTestId('buy-credits-picker')
    expect(screen.getAllByTestId('buy-credits-pack')[0].getAttribute('aria-checked')).toBe('true')
  })

  it('a Checkout answer sends the browser to Stripe', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Response(JSON.stringify({ mode: 'checkout', reason: 'no_card', url: 'https://checkout.stripe.com/x' }), { status: 200 })
        : new Response(JSON.stringify({ ...OFFER, card: null }), { status: 200 })
    )
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...window.location, set href(v: string) { assign(v) }, pathname: '/dashboard' }, writable: true })
    render(<BuyCreditsProvider />)
    act(() => openBuyCredits())
    await screen.findByTestId('buy-credits-picker')
    expect(screen.getByTestId('buy-credits-submit').textContent).toBe('Continue to payment — $20')
    fireEvent.click(screen.getByTestId('buy-credits-submit'))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/x'))
  })

  it('a free company is offered the subscription instead of packs', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ eligible: false, reason: 'subscribe', balance: 0 }), { status: 200 }))
    render(<BuyCreditsProvider />)
    act(() => openBuyCredits())
    const link = await screen.findByRole('link', { name: 'Subscribe to Pro' })
    expect(link.getAttribute('href')).toBe('/settings/billing#choose-plan')
  })
})
