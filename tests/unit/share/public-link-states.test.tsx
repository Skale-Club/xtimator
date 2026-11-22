import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
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
vi.mock('@/app/estimate/[token]/actions', () => ({ respondToEstimate: vi.fn(), logEstimateView: vi.fn() }))
vi.mock('@/app/change-order/[token]/actions', () => ({ declineChangeOrder: vi.fn() }))
vi.mock('@/hooks/use-estimate-tracking', () => ({ useEstimateTracking: () => ({ trackAction: () => {} }) }))
vi.mock('@/components/share/signature-pad', () => ({ SignaturePad: () => <div data-testid="signature-pad-stub" /> }))

import { EstimateView } from '@/components/share/estimate-view'
import { ChangeOrderView } from '@/components/share/change-order-view'
import { buildChangeOrderData, SIGNED } from './change-order-fixtures'
import type { ChangeOrder, PublicChangeOrderData } from '@/lib/change-orders/types'

/**
 * XTM-D-20261121-feature-switches: the four states of a public link, which are
 * the product of two independent switches:
 *
 *   signature off / on   x   a payable invoice absent / present
 *
 *   off + none : view only (no accept, no decline, no signing dialog, no pay link)
 *   on  + none : accept and decline, no pay link
 *   off + open : view + pay link, still no accept / decline
 *   on  + open : both
 *
 * Plus: an answered (signed) document stays answered when signing is switched
 * off afterwards, and an already-issued invoice stays visible and payable.
 */

const SLOW = { timeout: 10_000 }
const HOSTED = 'https://invoice.stripe.com/i/test_hosted'
const RESPONSE_UI = /accept|decline|sign|approve/i

// ---------------------------------------------------------------- estimate view

function buildEstimate(over: Record<string, unknown> = {}, companyOver: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    language: 'en',
    version: 1,
    estimate_seq: 1,
    created_at: '2026-01-01T00:00:00Z',
    responded_at: null,
    client_response: null,
    is_current: true,
    updated_at: '2026-01-05T10:00:00.123456+00:00',
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
      digital_signature_enabled: false,
      estimate_terms_enabled: false,
      estimate_terms_text: null,
      estimate_template_style: 'classic',
      ...companyOver,
    },
    ...over,
  }
}

const OPEN_INVOICE = { id: 'inv-open', kind: 'full', amount_cents: 123450, currency_code: 'USD', status: 'open', hosted_invoice_url: HOSTED, refunded_cents: 0 }
const PAID_INVOICE = { id: 'inv-paid', kind: 'deposit', amount_cents: 40000, currency_code: 'USD', status: 'paid', hosted_invoice_url: HOSTED, refunded_cents: 0 }

function renderEstimate(over: Record<string, unknown>, signature: boolean, viewProps: Record<string, unknown> = {}) {
  return render(
    <EstimateView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estimate={buildEstimate(over, { digital_signature_enabled: signature }) as any}
      client={null}
      token="tok"
      alreadyResponded={false}
      appName="Xtimator"
      preparedBy={null}
      {...viewProps}
    />,
  )
}

const payLink = () => {
  const a = Array.from(document.querySelectorAll('a')).find((el) => el.getAttribute('href') === HOSTED)
  return a ?? null
}

describe('EstimateView: the four public link states', () => {
  it('signature off + no invoice: view only', async () => {
    const { container } = renderEstimate({}, false)
    await screen.findByText('Job summary', {}, SLOW)
    expect(screen.queryByRole('button', { name: RESPONSE_UI })).toBeNull()
    expect(screen.queryByTestId('mobile-accept-bar')).toBeNull()
    expect(container.querySelector('#estimate-response')).toBeNull()
    expect(screen.queryByText('Sign to accept this estimate')).toBeNull()
    expect(screen.queryByTestId('signature-pad-stub')).toBeNull()
    expect(payLink()).toBeNull()
    expect(screen.queryByText('Invoices')).toBeNull()
    expect(screen.getByTestId('proposal-bar')).toBeTruthy()
  }, 20_000)

  it('signature on + no invoice: accept and decline, no pay link', async () => {
    renderEstimate({}, true)
    await screen.findByText('Job summary', {}, SLOW)
    expect(within(screen.getByTestId('proposal-bar')).getByRole('button', { name: /^accept$/i })).toBeTruthy()
    expect(screen.getByTestId('mobile-accept-bar')).toBeTruthy()
    expect(payLink()).toBeNull()
    expect(screen.queryByText('Invoices')).toBeNull()
  }, 20_000)

  it('signature off + open invoice: pay link present, still no accept or decline', async () => {
    renderEstimate({ invoices: [OPEN_INVOICE] }, false)
    await screen.findByText('Job summary', {}, SLOW)
    const link = payLink()
    expect(link).not.toBeNull()
    expect(link!.textContent).toContain('$1,234.50')
    expect(link!.getAttribute('rel')).toContain('noopener')
    expect(screen.queryByRole('button', { name: RESPONSE_UI })).toBeNull()
    expect(screen.queryByTestId('mobile-accept-bar')).toBeNull()
    expect(screen.queryByText('Sign to accept this estimate')).toBeNull()
  }, 20_000)

  it('signature on + open invoice: both', async () => {
    renderEstimate({ invoices: [OPEN_INVOICE] }, true)
    await screen.findByText('Job summary', {}, SLOW)
    expect(payLink()).not.toBeNull()
    expect(within(screen.getByTestId('proposal-bar')).getByRole('button', { name: /^accept$/i })).toBeTruthy()
    expect(screen.getByTestId('mobile-accept-bar')).toBeTruthy()
  }, 20_000)

  it('a paid invoice stays visible when signature is off (history is never hidden)', async () => {
    renderEstimate({ invoices: [PAID_INVOICE] }, false)
    await screen.findByText('Job summary', {}, SLOW)
    expect(screen.getByText(/Paid:/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: RESPONSE_UI })).toBeNull()
  }, 20_000)

  it('an open invoice without a hosted link renders nothing (no empty Invoices card)', async () => {
    renderEstimate({ invoices: [{ ...OPEN_INVOICE, hosted_invoice_url: null }] }, false)
    await screen.findByText('Job summary', {}, SLOW)
    expect(screen.queryByText('Invoices')).toBeNull()
  }, 20_000)

  it('signed then switched off: stays accepted and signed, nothing to click', async () => {
    renderEstimate(
      {
        client_response: 'accepted',
        responded_at: '2026-02-01T00:00:00Z',
        signerName: 'Jane Doe',
        signedAt: '2026-02-01T00:00:00Z',
        signatureImageDataUrl: 'data:image/png;base64,AAAA',
      },
      false,
      { alreadyResponded: true },
    )
    await screen.findByText('Job summary', {}, SLOW)
    expect(screen.getByTestId('response-status').textContent).toContain('Accepted on')
    expect(screen.queryByRole('button', { name: RESPONSE_UI })).toBeNull()
    expect(screen.queryByTestId('mobile-accept-bar')).toBeNull()
    expect(document.body.textContent).toContain('Jane Doe')
  }, 20_000)

  it('declined then switched off: stays declined', async () => {
    renderEstimate({ client_response: 'declined', responded_at: '2026-02-01T00:00:00Z' }, false, { alreadyResponded: true })
    await screen.findByText('Job summary', {}, SLOW)
    expect(screen.getByTestId('response-status').textContent).toContain('Declined on')
    expect(screen.queryByRole('button', { name: RESPONSE_UI })).toBeNull()
  }, 20_000)

  it('the public estimate never renders a platform switch value anywhere', async () => {
    renderEstimate({ invoices: [OPEN_INVOICE] }, false)
    await screen.findByText('Job summary', {}, SLOW)
    expect(document.body.innerHTML).not.toMatch(/digital_signature_allowed|online_payments_(allowed|enabled)|stripe_account_id/)
  }, 20_000)
})

// ---------------------------------------------------------- change order view

const CO_OPEN = {
  id: 'inv-1',
  status: 'open' as const,
  amount_cents: 51500,
  currency_code: 'USD',
  hosted_invoice_url: HOSTED,
  paid_at: null,
}
const APPROVED = { status: 'accepted' as const, client_response: 'accepted' as const, responded_at: '2026-02-03T15:00:00Z' }

function renderCo(
  over: Partial<ChangeOrder>,
  signature: boolean,
  dataOver: Partial<PublicChangeOrderData> = {},
) {
  return render(
    <ChangeOrderView
      data={buildChangeOrderData(over, { digital_signature_enabled: signature }, dataOver)}
      token="tok-co1"
      appName="Xtimator"
    />,
  )
}

describe('ChangeOrderView: the four public link states', () => {
  it('signature off + no invoice: view only (contact line, no actions, no dialog, no pay link)', () => {
    renderCo({}, false, { invoice: null })
    expect(screen.queryByTestId('change-order-actions')).toBeNull()
    expect(screen.queryByRole('button', { name: RESPONSE_UI })).toBeNull()
    expect(screen.queryByTestId('signature-pad-stub')).toBeNull()
    expect(screen.queryByTestId('change-order-pay-invoice')).toBeNull()
    expect(screen.getByTestId('contact-to-approve')).toBeTruthy()
  })

  it('signature on + no invoice: approve and decline, no pay link', () => {
    renderCo({}, true, { invoice: null })
    expect(screen.getByTestId('change-order-actions')).toBeTruthy()
    expect(screen.queryByTestId('contact-to-approve')).toBeNull()
    expect(screen.queryByTestId('change-order-pay-invoice')).toBeNull()
  })

  it('signature off + open invoice: pay link present, still no approve or decline', () => {
    renderCo(APPROVED, false, { invoice: CO_OPEN })
    const card = screen.getByTestId('change-order-pay-invoice')
    expect((within(card).getByRole('link', { name: /Pay invoice/ }) as HTMLAnchorElement).href).toBe(HOSTED)
    expect(screen.queryByTestId('change-order-actions')).toBeNull()
    expect(screen.queryByRole('button', { name: RESPONSE_UI })).toBeNull()
  })

  it('signature on + open invoice: both (the change order is still open to answer)', () => {
    renderCo({}, true, { invoice: CO_OPEN })
    expect(screen.getByTestId('change-order-actions')).toBeTruthy()
    expect(screen.getByTestId('change-order-pay-invoice')).toBeTruthy()
  })

  it('approved and signed, then switched off: stays approved with its signature, no contact-to-approve line', () => {
    renderCo({ ...APPROVED, hasSignature: true, signature: SIGNED }, false, { invoice: null })
    expect(screen.getByText('Change order approved')).toBeTruthy()
    expect(within(screen.getByTestId('approved-signature')).getByRole('img').getAttribute('src')).toBe(SIGNED.signature_data)
    expect(screen.queryByTestId('change-order-actions')).toBeNull()
    expect(screen.queryByTestId('contact-to-approve')).toBeNull()
  })

  it('declined, then switched off: stays declined', () => {
    renderCo({ status: 'declined', client_response: 'declined', responded_at: '2026-02-03T15:00:00Z' }, false, { invoice: null })
    expect(screen.getByText('Change order declined')).toBeTruthy()
    expect(screen.queryByTestId('change-order-actions')).toBeNull()
  })

  it('a paid invoice stays visible when signature is off', () => {
    renderCo(APPROVED, false, { invoice: { ...CO_OPEN, status: 'paid', paid_at: '2026-02-04T10:00:00Z' } })
    expect(screen.getByTestId('change-order-invoice-paid')).toBeTruthy()
  })

  it('never renders a platform switch value', () => {
    renderCo(APPROVED, false, { invoice: CO_OPEN })
    expect(document.body.innerHTML).not.toMatch(/digital_signature_allowed|online_payments_(allowed|enabled)|stripe_account_id/)
  })
})

describe('refund labels: over-refunds and boundaries read Refunded (both public surfaces)', () => {
  it('estimate view: refunded_cents above the amount is still "Refunded"', async () => {
    cleanup()
    renderEstimate({ invoices: [{ ...PAID_INVOICE, refunded_cents: 40001 }] }, false)
    expect((await screen.findByTestId('invoice-refund-label', {}, SLOW)).textContent).toBe('Refunded')
  }, 20_000)

  it('estimate view: one cent short of the amount is "Partly refunded"', async () => {
    cleanup()
    renderEstimate({ invoices: [{ ...PAID_INVOICE, refunded_cents: 39999 }] }, false)
    expect((await screen.findByTestId('invoice-refund-label', {}, SLOW)).textContent).toContain('Partly refunded')
  }, 20_000)

  it('change order view: above and one cent short', () => {
    cleanup()
    const paid = { ...CO_OPEN, status: 'paid' as const, paid_at: '2026-02-04T10:00:00Z' }
    const first = renderCo(APPROVED, false, { invoice: { ...paid, refunded_cents: 51501 } })
    expect(screen.getByTestId('invoice-refund-label').textContent).toBe('Refunded')
    first.unmount()
    renderCo(APPROVED, false, { invoice: { ...paid, refunded_cents: 51499 } })
    expect(screen.getByTestId('invoice-refund-label').textContent).toContain('Partly refunded')
  })
})
