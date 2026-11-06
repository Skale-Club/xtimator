import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
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
// Online approval is gated by company.digital_signature_enabled
// ---------------------------------------------------------------------------

const RESPONSE_UI = /accept|decline|sign/i

describe('EstimateView — approval OFF (digital_signature_enabled = false)', () => {
  it('renders no accept/decline/respond UI anywhere: no bar button, no sticky bar, no card', async () => {
    const { container } = renderView({}, { digital_signature_enabled: false })
    await screen.findByText('Job summary', {}, SLOW)
    expect(screen.queryByTestId('mobile-accept-bar')).toBeNull()
    expect(container.querySelector('#estimate-response')).toBeNull()
    expect(screen.queryByRole('button', { name: RESPONSE_UI })).toBeNull()
    expect(screen.queryByText('Decline Estimate')).toBeNull()
    expect(screen.queryByText('Accept Estimate')).toBeNull()
    // the proposal bar itself is still there
    expect(screen.getByTestId('proposal-bar')).toBeTruthy()
  })

  it('shows only a small neutral status line when the contractor already recorded a response', async () => {
    renderView(
      { client_response: 'accepted', responded_at: '2026-02-01T00:00:00Z' },
      { digital_signature_enabled: false },
      { alreadyResponded: true }
    )
    await screen.findByText('Job summary', {}, SLOW)
    const status = screen.getByTestId('response-status')
    expect(status.textContent).toContain('Accepted on')
    expect(within(status).queryByRole('button')).toBeNull()
    expect(screen.queryByRole('button', { name: RESPONSE_UI })).toBeNull()
  })
})

describe('EstimateView — approval ON (digital_signature_enabled = true)', () => {
  it('shows Accept in the proposal bar and a mobile-only bottom Accept bar with the total', async () => {
    renderView({}, { digital_signature_enabled: true })
    await screen.findByText('Job summary', {}, SLOW)
    const header = screen.getByTestId('proposal-bar')
    expect(within(header).getByRole('button', { name: /^accept$/i })).toBeTruthy()
    expect(within(header).getByTestId('proposal-bar-total').textContent).toBe('$1,234.50')

    const bar = screen.getByTestId('mobile-accept-bar')
    expect(bar.className).toContain('fixed')
    expect(bar.className).toContain('bottom-0')
    expect(bar.className).toContain('sm:hidden')
    expect(bar.className).toContain('env(safe-area-inset-bottom)')
    expect(within(bar).getByText('$1,234.50').className).toContain('tabular-nums')
  })

  it('old bottom Accept/Decline card is gone', async () => {
    const { container } = renderView({}, { digital_signature_enabled: true })
    await screen.findByText('Job summary', {}, SLOW)
    expect(container.querySelector('#estimate-response')).toBeNull()
    expect(screen.queryByText('Decline Estimate')).toBeNull()
  })

  it('Accept opens the signature panel (does not accept) and hides the mobile bar', async () => {
    const actions = await import('@/app/estimate/[token]/actions')
    renderView({}, { digital_signature_enabled: true })
    await screen.findByText('Job summary', {}, SLOW)
    fireEvent.click(within(screen.getByTestId('proposal-bar')).getByRole('button', { name: /^accept$/i }))
    expect(await screen.findByText('Sign to accept this estimate')).toBeTruthy()
    expect(screen.getByRole('button', { name: /sign & accept estimate/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^decline estimate$/i })).toBeTruthy()
    expect(screen.queryByTestId('mobile-accept-bar')).toBeNull()
    expect(actions.respondToEstimate).not.toHaveBeenCalled()
  })

  it('the mobile bar Accept also opens the signature panel', async () => {
    renderView({}, { digital_signature_enabled: true })
    await screen.findByText('Job summary', {}, SLOW)
    fireEvent.click(within(screen.getByTestId('mobile-accept-bar')).getByRole('button'))
    expect(await screen.findByText('Sign to accept this estimate')).toBeTruthy()
  })

  it('Decline asks for confirmation before calling respondToEstimate(token, "declined")', async () => {
    const actions = await import('@/app/estimate/[token]/actions')
    vi.mocked(actions.respondToEstimate).mockResolvedValue({ success: true })
    renderView({}, { digital_signature_enabled: true })
    await screen.findByText('Job summary', {}, SLOW)
    fireEvent.click(within(screen.getByTestId('proposal-bar')).getByRole('button', { name: /^accept$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^decline estimate$/i }))
    expect(actions.respondToEstimate).not.toHaveBeenCalled()
    expect(screen.getByTestId('decline-confirm')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /yes, decline/i }))
    await waitFor(() => expect(actions.respondToEstimate).toHaveBeenCalledWith('tok', 'declined'))
    expect(await screen.findByText('Estimate Declined')).toBeTruthy()
  })

  it('already responded: compact confirmation, no Accept anywhere', async () => {
    renderView(
      { client_response: 'accepted', responded_at: '2026-02-01T00:00:00Z' },
      { digital_signature_enabled: true },
      { alreadyResponded: true }
    )
    await screen.findByText('Job summary', {}, SLOW)
    expect(screen.queryByTestId('mobile-accept-bar')).toBeNull()
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull()
    expect(screen.getByText('Estimate Accepted')).toBeTruthy()
  })
})

describe('EstimateView — proposal bar', () => {
  it('shows company, number, date and contact actions only for fields the company has', async () => {
    renderView(
      { estimate_number: 'EST-77', estimate_date: '2026-03-05' },
      { phone: '(555) 123-4567', email: 'a@b.co' }
    )
    await screen.findByText('Job summary', {}, SLOW)
    const header = screen.getByTestId('proposal-bar')
    expect(within(header).getByText('Acme')).toBeTruthy()
    expect(header.textContent).toContain('EST-77')
    expect(header.textContent).toContain('March 5, 2026')
    expect(within(header).getByLabelText('Call').getAttribute('href')).toBe('tel:(555) 123-4567')
    expect(within(header).getByLabelText('WhatsApp').getAttribute('href')).toBe('https://wa.me/15551234567')
    expect(within(header).getByLabelText('Email').getAttribute('href')).toBe('mailto:a@b.co')
  })

  it('omits contact icons the company does not have', async () => {
    renderView()
    await screen.findByText('Job summary', {}, SLOW)
    const header = screen.getByTestId('proposal-bar')
    expect(within(header).queryByLabelText('Call')).toBeNull()
    expect(within(header).queryByLabelText('WhatsApp')).toBeNull()
    expect(within(header).queryByLabelText('Email')).toBeNull()
  })
})
