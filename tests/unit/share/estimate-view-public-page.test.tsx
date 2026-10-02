import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import React, { Suspense } from 'react'

// next/dynamic -> React.lazy so the real document components render in jsdom.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<React.ComponentType<Record<string, unknown>>>) => {
    const Lazy = React.lazy(() => loader().then((C) => ({ default: C })))
    return function Dyn(props: Record<string, unknown>) {
      return (
        <Suspense fallback={null}>
          <Lazy {...props} />
        </Suspense>
      )
    }
  },
}))
vi.mock('@/app/estimate/[token]/actions', () => ({
  respondToEstimate: vi.fn(),
  logEstimateView: vi.fn(),
}))
vi.mock('@/hooks/use-estimate-tracking', () => ({ useEstimateTracking: () => {} }))

import { EstimateView } from '@/components/share/estimate-view'

// The first dynamic import of the classic document is slow under jsdom.
const SLOW = { timeout: 10_000 }
const TERMS = 'Estimate valid for 30 days.'
const PREPARED_BY = 'Sam Staff'

function buildEstimate(over: Record<string, unknown> = {}, companyOver: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    language: 'en',
    version: 1,
    estimate_seq: 1,
    created_at: '2026-01-01T00:00:00Z',
    responded_at: null,
    client_response: null,
    summary: 'Job summary',
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    discount_type: null,
    discount_value: null,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    subtotal: 1234.5,
    total: 1234.5,
    total_amount_cents: 123450,
    currency_code: 'USD',
    sections: [],
    invoices: [],
    attachedPhotos: [],
    signerName: null,
    signedAt: null,
    signatureImageDataUrl: null,
    project: { name: 'Kitchen', project_type: null },
    company: {
      id: 'c1',
      name: 'Acme',
      owner_name: 'Owner',
      phone: null, email: null, website: null, address: null, city: null, state: null, zip: null,
      logo_url: null,
      brand_primary_color: '#2563eb',
      stripe_account_id: null,
      stripe_connect_status: null,
      digital_signature_enabled: false,
      estimate_terms_enabled: true,
      estimate_terms_text: TERMS,
      estimate_template_style: 'classic',
      ...companyOver,
    },
    ...over,
  }
}

function renderView(
  over: Record<string, unknown> = {},
  companyOver: Record<string, unknown> = {},
  viewProps: Record<string, unknown> = {}
) {
  return render(
    <EstimateView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estimate={buildEstimate(over, companyOver) as any}
      client={null}
      token="tok"
      alreadyResponded={false}
      appName="Xtimator"
      preparedBy={PREPARED_BY}
      {...viewProps}
    />
  )
}

describe('EstimateView — public page carries the same content as the PDF', () => {
  it.each(['classic', 'modern'])(
    '%s: renders Prepared by + company Estimate Terms INSIDE the document, no external terms card',
    async (style) => {
      const { container } = renderView({}, { estimate_template_style: style })
      expect(await screen.findByText(PREPARED_BY, {}, SLOW)).toBeTruthy()
      expect(screen.getByText('Prepared by')).toBeTruthy()
      expect(screen.getByText(TERMS)).toBeTruthy()
      // exactly one terms heading — the old external Card would have made it
      // one inside the page-level Card and none in the document.
      expect(screen.getAllByText('Estimate Terms')).toHaveLength(1)

      // The terms live inside the document surface (the ref'd wrapper that also
      // holds the summary), not as a sibling card of the response CTA.
      const termsEl = screen.getByText(TERMS)
      const summaryEl = screen.getByText('Job summary')
      let common: HTMLElement | null = termsEl.parentElement
      while (common && !common.contains(summaryEl)) common = common.parentElement
      expect(common).toBeTruthy()
      expect(common!.closest('[data-slot="card"][id="estimate-response"]')).toBeNull()
      expect(container.querySelector('#estimate-response')?.contains(termsEl)).toBe(false)
      // The direct page-level glass cards are only: response card (no terms card).
      const pageCards = Array.from(container.firstElementChild!.children).filter(
        (el) => el.getAttribute('data-slot') === 'card'
      )
      expect(pageCards.some((c) => c.textContent?.includes(TERMS))).toBe(false)
    },
    20_000
  )

  it('omits Estimate Terms when disabled and Prepared by when absent', async () => {
    renderView({}, { estimate_terms_enabled: false }, { preparedBy: null })
    await screen.findByText('Job summary', {}, SLOW)
    expect(screen.queryByText(TERMS)).toBeNull()
    expect(screen.queryByText('Prepared by')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Mobile sticky Accept bar
// ---------------------------------------------------------------------------

type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void
let observers: { cb: IOCallback; targets: Element[]; options?: IntersectionObserverInit }[] = []

class MockIntersectionObserver {
  cb: IOCallback
  targets: Element[] = []
  options?: IntersectionObserverInit
  constructor(cb: IOCallback, options?: IntersectionObserverInit) {
    this.cb = cb
    this.options = options
    observers.push(this)
  }
  observe(el: Element) {
    this.targets.push(el)
  }
  disconnect() {
    this.targets = []
  }
  unobserve() {}
  takeRecords() {
    return []
  }
}

function setResponseCardVisible(isIntersecting: boolean) {
  const live = observers.filter((o) => o.targets.length > 0)
  expect(live.length).toBeGreaterThan(0)
  act(() => {
    for (const o of live) o.cb([{ isIntersecting, target: o.targets[0] }])
  })
}

describe('EstimateView — mobile sticky Accept bar', () => {
  const scrollIntoView = vi.fn()

  beforeEach(() => {
    observers = []
    scrollIntoView.mockReset()
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    Element.prototype.scrollIntoView = scrollIntoView
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows total + Accept for an unresponded estimate, mobile-only (sm:hidden), safe-area padded', async () => {
    renderView()
    await screen.findByText('Job summary', {}, SLOW)
    const bar = screen.getByTestId('mobile-accept-bar')
    expect(bar.className).toContain('fixed')
    expect(bar.className).toContain('bottom-0')
    expect(bar.className).toContain('sm:hidden')
    expect(bar.className).toContain('env(safe-area-inset-bottom)')
    expect(within(bar).getByText('Total')).toBeTruthy()
    const total = within(bar).getByText('$1,234.50')
    expect(total.className).toContain('tabular-nums')
    expect(within(bar).getByRole('button', { name: /accept/i })).toBeTruthy()
  })

  it('observes the response card and hides while it is in view, shows again when it leaves', async () => {
    const { container } = renderView()
    await screen.findByText('Job summary', {}, SLOW)
    const card = container.querySelector('#estimate-response')
    expect(card).toBeTruthy()
    expect(observers.some((o) => o.targets.includes(card!))).toBe(true)

    expect(screen.queryByTestId('mobile-accept-bar')).toBeTruthy()
    setResponseCardVisible(true)
    expect(screen.queryByTestId('mobile-accept-bar')).toBeNull()
    setResponseCardVisible(false)
    expect(screen.queryByTestId('mobile-accept-bar')).toBeTruthy()
  })

  it('tapping the bar scrolls to the response card smoothly and does NOT accept', async () => {
    const actions = await import('@/app/estimate/[token]/actions')
    renderView()
    await screen.findByText('Job summary', {}, SLOW)
    fireEvent.click(within(screen.getByTestId('mobile-accept-bar')).getByRole('button'))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById('estimate-response'))
    expect(actions.respondToEstimate).not.toHaveBeenCalled()
  })

  it('respects prefers-reduced-motion (instant scroll)', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    renderView()
    await screen.findByText('Job summary', {}, SLOW)
    fireEvent.click(within(screen.getByTestId('mobile-accept-bar')).getByRole('button'))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' })
  })

  it('is not rendered when the estimate was already responded to', async () => {
    renderView({ client_response: 'accepted', responded_at: '2026-02-01T00:00:00Z' }, {}, { alreadyResponded: true })
    await screen.findByText('Job summary', {}, SLOW)
    expect(screen.queryByTestId('mobile-accept-bar')).toBeNull()
    expect(screen.getByText('Estimate Accepted')).toBeTruthy()
  })

  it('is hidden while the signature pad is open', async () => {
    const { container } = renderView({}, { digital_signature_enabled: true })
    await screen.findByText('Job summary', {}, SLOW)
    expect(screen.queryByTestId('mobile-accept-bar')).toBeTruthy()
    // Real Accept button in the response card opens the pad.
    fireEvent.click(
      within(container.querySelector('#estimate-response') as HTMLElement).getByRole('button', {
        name: /accept estimate/i,
      })
    )
    expect(screen.getByText('Sign to accept this estimate')).toBeTruthy()
    expect(screen.queryByTestId('mobile-accept-bar')).toBeNull()
  })
})
