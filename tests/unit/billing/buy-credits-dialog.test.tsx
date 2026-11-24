import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

/**
 * Credits plan 2026-11-20 - the shared buy dialog: opens on openBuyCredits(),
 * shows the packs (credits, best value, price) and the saved
 * card, buys in one click and announces the purchase; a Checkout answer
 * redirects.
 */

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
const T = (s: string) => s
vi.mock('@/lib/i18n/use-translation', () => ({ useTranslation: () => ({ t: T }) }))
const toastSuccess = vi.fn()
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() }) }))

const { BuyCreditsProvider, BuyCreditsInline, openBuyCredits, CREDITS_PURCHASED_EVENT } = await import('@/components/billing/buy-credits')

const OFFER = {
  eligible: true,
  balance: 120,
  expiryMonths: 3,
  defaultIndex: 1,
  card: { brand: 'Visa', last4: '4242' },
  packs: [
    { index: 0, credits: 900, priceCents: 1000, currency: 'usd', bestValue: false },
    { index: 1, credits: 1900, priceCents: 2000, currency: 'usd', bestValue: false },
    { index: 2, credits: 5000, priceCents: 5000, currency: 'usd', bestValue: true },
  ],
}

const fetchMock = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? new Response(JSON.stringify({ mode: 'charged', granted: true, credits: 5000, balance: 5120 }), { status: 200 })
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

  it.each(['pending', 'ungranted', 'lost response'] as const)(
    'keeps a %s purchase pending until the identical purchase confirms delivery',
    async (outcome) => {
      let posts = 0
      fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method !== 'POST') return new Response(JSON.stringify(OFFER), { status: 200 })
        if (++posts > 1) {
          return new Response(JSON.stringify({ mode: 'charged', granted: true, credits: 1900, balance: 2020 }), { status: 200 })
        }
        if (outcome === 'lost response') throw new Error('Network response lost')
        return new Response(JSON.stringify(outcome === 'pending'
          ? { mode: 'pending', code: 'payment_pending' }
          : { mode: 'charged', granted: false, credits: 1900, balance: 120 }), { status: outcome === 'pending' ? 202 : 200 })
      })
      const purchased = vi.fn()
      window.addEventListener(CREDITS_PURCHASED_EVENT, purchased)
      try {
        render(<BuyCreditsProvider />)
        act(() => openBuyCredits())
        await screen.findByTestId('buy-credits-picker')
        fireEvent.click(screen.getByTestId('buy-credits-submit'))
        await screen.findByTestId('buy-credits-pending')
        expect(toastSuccess).not.toHaveBeenCalled()
        expect(purchased).not.toHaveBeenCalled()
        expect(screen.queryByTestId('buy-credits-submit')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Use another card' })).toBeNull()

        // Reopening with another suggested pack must not replace the pending purchase.
        act(() => openBuyCredits({ packIndex: 2 }))
        await screen.findByTestId('buy-credits-pending')
        fireEvent.click(screen.getByRole('button', { name: 'Check payment status' }))
        await waitFor(() => expect(purchased).toHaveBeenCalledTimes(1))
        const postBodies = fetchMock.mock.calls
          .filter(([, init]) => init?.method === 'POST')
          .map(([, init]) => JSON.parse(init.body))
        expect(postBodies).toHaveLength(2)
        expect(postBodies[1]).toEqual(postBodies[0])
        expect(postBodies[1]).toMatchObject({ packIndex: 1, useOtherCard: false })
        expect(toastSuccess).toHaveBeenCalledTimes(1)
      } finally {
        window.removeEventListener(CREDITS_PURCHASED_EVENT, purchased)
      }
    },
  )

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

  it('restores an inline picker after a pending purchase is confirmed', async () => {
    let posts = 0
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') return new Response(JSON.stringify(OFFER), { status: 200 })
      return new Response(JSON.stringify(++posts === 1
        ? { mode: 'pending', code: 'payment_pending' }
        : { mode: 'charged', granted: true, credits: 1900, balance: 2020 }), { status: 200 })
    })
    const onPurchased = vi.fn()
    render(<BuyCreditsInline onPurchased={onPurchased} />)
    await screen.findByTestId('buy-credits-picker')
    fireEvent.click(screen.getByTestId('buy-credits-submit'))
    await screen.findByTestId('buy-credits-pending')
    fireEvent.click(screen.getByRole('button', { name: 'Check payment status' }))
    await waitFor(() => expect(onPurchased).toHaveBeenCalledTimes(1))
    await screen.findByTestId('buy-credits-picker')
    expect(screen.queryByTestId('buy-credits-pending')).toBeNull()
  })

  it('recovers the company pending purchase from GET after a full remount', async () => {
    const pendingPurchase = {
      requestId: 'purchase-before-reload',
      packIndex: 0,
      useOtherCard: true,
      returnTo: '/projects/original',
    }
    let completed = false
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') {
        return new Response(JSON.stringify({ ...OFFER, pendingPurchase: completed ? null : pendingPurchase }), { status: 200 })
      }
      completed = true
      return new Response(JSON.stringify({ mode: 'charged', granted: true, credits: 900, balance: 1020 }), { status: 200 })
    })
    render(<BuyCreditsInline />)
    await screen.findByTestId('buy-credits-pending')
    expect(screen.queryByTestId('buy-credits-submit')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Check payment status' }))
    await screen.findByTestId('buy-credits-picker')
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(post[1].body)).toEqual(pendingPurchase)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('starts a new purchase identity only after the server definitively closes the pending payment', async () => {
    let posts = 0
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') return new Response(JSON.stringify(OFFER), { status: 200 })
      posts++
      if (posts === 1) return new Response(JSON.stringify({ mode: 'pending', code: 'payment_pending' }), { status: 202 })
      if (posts === 2) return new Response(JSON.stringify({ code: 'payment_closed' }), { status: 409 })
      return new Response(JSON.stringify({ mode: 'charged', granted: true, credits: 5000, balance: 5120 }), { status: 200 })
    })
    render(<BuyCreditsInline />)
    await screen.findByTestId('buy-credits-picker')
    fireEvent.click(screen.getByTestId('buy-credits-submit'))
    await screen.findByTestId('buy-credits-pending')
    fireEvent.click(screen.getByRole('button', { name: 'Check payment status' }))
    await screen.findByTestId('buy-credits-picker')
    expect(toastSuccess).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByTestId('buy-credits-pack')[2])
    fireEvent.click(screen.getByTestId('buy-credits-submit'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1))
    const bodies = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(init.body))
    expect(bodies[1]).toEqual(bodies[0])
    expect(bodies[2].requestId).not.toBe(bodies[0].requestId)
    expect(bodies[2].packIndex).toBe(2)
  })

  it('a free company is offered the subscription instead of packs', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ eligible: false, reason: 'subscribe', balance: 0 }), { status: 200 }))
    render(<BuyCreditsProvider />)
    act(() => openBuyCredits())
    const link = await screen.findByRole('link', { name: 'Subscribe to Pro' })
    expect(link.getAttribute('href')).toBe('/settings/billing#choose-plan')
  })
})
