import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('@/app/change-order/[token]/actions', () => ({ declineChangeOrder: vi.fn() }))
// jsdom has no canvas: a stub pad that can set the signer name and a signature.
vi.mock('@/components/share/signature-pad', () => ({
  SignaturePad: (props: {
    onSignerNameChange: (v: string) => void
    onSignatureChange: (v: string | null) => void
  }) => (
    <div>
      <button type="button" onClick={() => props.onSignerNameChange('Jane Doe')}>stub-name</button>
      <button type="button" onClick={() => props.onSignatureChange('data:image/png;base64,AAAA')}>stub-draw</button>
    </div>
  ),
}))

import { ChangeOrderView } from '@/components/share/change-order-view'
import { declineChangeOrder } from '@/app/change-order/[token]/actions'
import { buildChangeOrderData, SIGNED } from './change-order-fixtures'
import type { ChangeOrder, PublicChangeOrderData } from '@/lib/change-orders/types'

function renderView(
  over: Partial<ChangeOrder> = {},
  companyOver: Partial<PublicChangeOrderData['company']> = {},
  viewProps: Record<string, unknown> = {},
  dataOver: Partial<PublicChangeOrderData> = {},
) {
  return render(
    <ChangeOrderView
      data={buildChangeOrderData(over, companyOver, dataOver)}
      token="tok-co1"
      appName="Xtimator"
      {...viewProps}
    />,
  )
}

describe('ChangeOrderView - content', () => {
  it('shows the kicker, project, reason, lines with credit signs and the totals', () => {
    renderView()
    expect(screen.getByTestId('change-order-kicker').textContent).toBe('Change order #1 · estimate SK-1045')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Kitchen remodel')
    expect(screen.getByText(/asks for your approval of a change to the work accepted on January 10, 2026/)).toBeTruthy()
    expect(screen.getByText('The client asked to paint the garage too.')).toBeTruthy()

    const amounts = screen.getAllByTestId('line-amount')
    expect(amounts.map((a) => a.textContent)).toEqual(['$1,500.00', '−$400.00'])
    expect(amounts[0].className).not.toContain('text-red')
    expect(amounts[1].className).toContain('text-red')

    const totals = screen.getByTestId('change-order-totals')
    expect(within(totals).getByText('Current contract').nextSibling?.textContent).toBe('$10,000.00')
    expect(totals.textContent).toContain('This change order$1,100.00')
    expect(within(totals).getByText('New total').nextSibling?.textContent).toBe('$11,100.00')
    expect(totals.textContent).toContain('+3 days')
  })

  it('links the accepted estimate and the PDF (with the token)', () => {
    renderView()
    expect(screen.getByRole('link', { name: /see the accepted estimate/i }).getAttribute('href')).toBe('/estimate/tok-est')
    expect(screen.getByRole('link', { name: /download pdf/i }).getAttribute('href')).toBe(
      '/api/change-orders/co1/pdf?token=tok-co1',
    )
  })

  it('a credit-only change order reads in red with a minus and lowers the total', () => {
    renderView({
      total: -400,
      subtotal: -400,
      items: [{ id: 'i2', description: 'Credit', quantity: 1, unit: null, unit_price: -400, total: -400, taxable: false, sort_order: 0 }],
    })
    const totals = screen.getByTestId('change-order-totals')
    expect(within(totals).getByText('New total').nextSibling?.textContent).toBe('$9,600.00')
    expect(totals.textContent).toContain('−$400.00')
  })

  it('shows the owner preview band only for owner visits', () => {
    const { unmount } = renderView()
    expect(screen.queryByTestId('owner-preview-band')).toBeNull()
    unmount()
    renderView({}, {}, { ownerPreview: true })
    expect(screen.getByTestId('owner-preview-band').textContent).toBe(
      "You're viewing your own change order. This visit isn't counted.",
    )
  })

  it('renders in the estimate language (pt)', () => {
    const data = buildChangeOrderData()
    data.estimate.language = 'pt'
    render(<ChangeOrderView data={data} token="tok-co1" appName="Xtimator" />)
    expect(screen.getByText('Aprovar e assinar')).toBeTruthy()
    expect(screen.getByTestId('change-order-kicker').textContent).toBe('Aditivo nº 1 · orçamento SK-1045')
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar e assinar' }))
    const consent = 'Ao assinar, você aprova esta alteração e o novo total do contrato.'
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
    expect(within(dialog).getAllByText(consent)).toHaveLength(2)
  })
})

describe('ChangeOrderView - online approval off', () => {
  it('shows no approve/decline UI, only the contact line with the phone as text', () => {
    renderView({}, { digital_signature_enabled: false })
    expect(screen.queryByTestId('change-order-actions')).toBeNull()
    expect(screen.queryByRole('button', { name: /approve|decline/i })).toBeNull()
    const line = screen.getByTestId('contact-to-approve').textContent ?? ''
    expect(line).toContain('To approve this change, contact Acme.')
    expect(line.replace(/\D/g, '')).toContain('5551234567')
    expect(screen.getByTestId('contact-to-approve').querySelector('a')).toBeNull()
  })
})

describe('ChangeOrderView - approve and decline', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.clearAllMocks()
  })

  async function openAndSign() {
    fireEvent.click(screen.getByRole('button', { name: /approve and sign/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'stub-name' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'stub-draw' }))
    const submit = within(dialog).getByRole('button', { name: /sign & approve/i })
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(submit)
  }

  it('actions are one bar: fixed on phones, inline from sm up, tall enough to tap', () => {
    renderView()
    const bar = screen.getByTestId('change-order-actions')
    expect(bar.className).toContain('fixed')
    expect(bar.className).toContain('sm:static')
    expect(bar.className).toContain('env(safe-area-inset-bottom)')
    expect(within(bar).getByRole('button', { name: /approve and sign/i }).className).toContain('min-h-11')
  })

  it('submits the rendered version and fingerprint, then shows the committed evidence', async () => {
    const signature = {
      signerName: 'Committed Signer',
      signedAt: SIGNED.signed_at,
      signatureDataUrl: SIGNED.signature_data,
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        signature,
        signedContract: { before: 10200, after: 11300, revision: 'committed-revision' },
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    renderView({}, {}, {}, {
      contentFingerprint: 'reviewed-fingerprint',
      signingContract: { before: 10100, after: 11200, revision: 'reviewed-revision' },
    })
    const totals = within(screen.getByTestId('change-order-totals'))
    expect(totals.getByText('New total').nextSibling?.textContent).toBe('$11,200.00')
    await openAndSign()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/change-orders/co1/sign')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      token: 'tok-co1',
      signerName: 'Jane Doe',
      signatureData: 'data:image/png;base64,AAAA',
      contentVersion: '2026-02-01T10:00:00.123456+00:00',
      contentFingerprint: 'reviewed-fingerprint',
    })
    expect(await screen.findByText('Change order approved')).toBeTruthy()
    const signatureBlock = within(screen.getByTestId('approved-signature'))
    expect(signatureBlock.getByText(signature.signerName)).toBeTruthy()
    expect(signatureBlock.getByRole('img').getAttribute('src')).toBe(signature.signatureDataUrl)
    expect(screen.getByTestId('response-status').textContent).toContain('Approved on February 3, 2026')
    expect(screen.queryByTestId('change-order-actions')).toBeNull()
    expect(totals.getByText('Current contract').nextSibling?.textContent).toBe('$10,200.00')
    expect(totals.getByText('New total').nextSibling?.textContent).toBe('$11,300.00')
  })

  it('409 change_order_updated closes the dialog and shows the reload notice', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'change_order_updated' }) })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const stale = renderView()
    await openAndSign()
    const notice = await screen.findByTestId('change-order-updated-notice')
    expect(notice.textContent).toContain('This change order was just updated. Review the latest version before signing.')
    expect(within(notice).getByRole('button', { name: /load latest version/i })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByTestId('change-order-actions')).toBeNull()
    expect(screen.queryByText('Change order approved')).toBeNull()

    stale.unmount()
    renderView({ updated_at: '2026-02-02T10:00:00Z' }, {}, {}, { contentFingerprint: 'new-fingerprint' })
    fireEvent.click(screen.getByRole('button', { name: /approve and sign/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'stub-name' }))
    expect(within(dialog).getByRole<HTMLButtonElement>('button', { name: /sign & approve/i }).disabled).toBe(true)
  })

  it.each([[403, 'link_locked'], [410, 'link_expired']])(
    'leaves an actionable link notice after %s %s', async (status, error) => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ error }) }) as unknown as typeof fetch
      renderView()
      await openAndSign()
      const notice = await screen.findByTestId('change-order-link-unavailable-notice')
      expect(notice.textContent).toContain('This link is no longer available. Please reload the page.')
      expect(within(notice).getByRole('button', { name: 'Load latest version' })).toBeTruthy()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.queryByTestId('change-order-actions')).toBeNull()
    },
  )

  it.each([
    ['already_responded', 'change-order-answered-notice'],
    ['contract_not_accepted', 'change-order-unavailable-notice'],
  ])('409 %s shows a short notice and hides the actions', async (error, testId) => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error }) }) as unknown as typeof fetch
    renderView()
    await openAndSign()
    expect(await screen.findByTestId(testId)).toBeTruthy()
    expect(screen.queryByTestId('change-order-actions')).toBeNull()
  })

  it('decline asks for confirmation before calling declineChangeOrder(token)', async () => {
    vi.mocked(declineChangeOrder).mockResolvedValue({ success: true })
    renderView()
    fireEvent.click(screen.getByRole('button', { name: /^decline$/i }))
    expect(declineChangeOrder).not.toHaveBeenCalled()
    expect(screen.getByTestId('decline-confirm')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /yes, decline/i }))
    await waitFor(() => expect(declineChangeOrder).toHaveBeenCalledWith('tok-co1'))
    expect(await screen.findByText('Change order declined')).toBeTruthy()
    expect(screen.queryByTestId('change-order-actions')).toBeNull()
  })

  it('"Keep reviewing" backs out of the decline without calling the action', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: /^decline$/i }))
    fireEvent.click(screen.getByRole('button', { name: /keep reviewing/i }))
    expect(declineChangeOrder).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /approve and sign/i })).toBeTruthy()
  })
})

describe('ChangeOrderView - answered states', () => {
  it('approved: signer, date and signature image, no actions, contract counted once', () => {
    renderView({
      status: 'accepted',
      client_response: 'accepted',
      responded_at: '2026-02-03T15:00:00Z',
      hasSignature: true,
      signature: SIGNED,
      signedContract: { before: 10000, after: 11100, revision: 'signed-revision' },
    })
    expect(screen.getByText('Change order approved')).toBeTruthy()
    expect(screen.getByTestId('response-status').textContent).toContain('Approved on February 3, 2026')
    const img = within(screen.getByTestId('approved-signature')).getByRole('img')
    expect(img.getAttribute('src')).toBe(SIGNED.signature_data)
    expect(screen.getByTestId('approved-signature').textContent).toContain('Jane Doe')
    expect(screen.queryByTestId('change-order-actions')).toBeNull()
    const totals = screen.getByTestId('change-order-totals')
    expect(within(totals).getByText('Current contract').nextSibling?.textContent).toBe('$10,000.00')
    expect(within(totals).getByText('New total').nextSibling?.textContent).toBe('$11,100.00')
  })

  it('declined: declined card, no actions', () => {
    renderView({ status: 'declined', client_response: 'declined', responded_at: '2026-02-03T15:00:00Z' })
    expect(screen.getByText('Change order declined')).toBeTruthy()
    expect(screen.getByTestId('response-status').textContent).toContain('Declined on February 3, 2026')
    expect(screen.queryByTestId('change-order-actions')).toBeNull()
    expect(screen.queryByTestId('approved-signature')).toBeNull()
  })
})

describe('ChangeOrderView - invoice', () => {
  const invoice = {
    id: 'inv-1',
    status: 'open' as const,
    amount_cents: 51500,
    currency_code: 'USD',
    hosted_invoice_url: 'https://invoice.stripe.com/i/test',
    paid_at: null,
  }
  const approvedOver = { status: 'accepted' as const, client_response: 'accepted' as const, responded_at: '2026-02-03T15:00:00Z' }

  it('shows a Pay invoice card with the amount for an open invoice', () => {
    renderView(approvedOver, {}, {}, { invoice })
    const card = screen.getByTestId('change-order-pay-invoice')
    expect(card.textContent).toContain('$515.00')
    const link = within(card).getByRole('link', { name: /Pay invoice/ }) as HTMLAnchorElement
    expect(link.href).toBe('https://invoice.stripe.com/i/test')
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noopener')
  })

  it('shows a Paid line once paid, and no pay card', () => {
    renderView(approvedOver, {}, {}, { invoice: { ...invoice, status: 'paid', paid_at: '2026-02-04T10:00:00Z' } })
    expect(screen.getByTestId('change-order-invoice-paid').textContent).toContain('Paid')
    expect(screen.queryByTestId('change-order-pay-invoice')).toBeNull()
  })

  it('labels a refunded paid invoice, fully or partly, and keeps it paid', () => {
    const paid = { ...invoice, status: 'paid' as const, paid_at: '2026-02-04T10:00:00Z' }
    const first = renderView(approvedOver, {}, {}, { invoice: { ...paid, refunded_cents: 51500 } })
    const section = screen.getByTestId('change-order-invoice-paid')
    expect(section.textContent).toContain('Paid')
    expect(screen.getByTestId('invoice-refund-label').textContent).toBe('Refunded')
    first.unmount()
    renderView(approvedOver, {}, {}, { invoice: { ...paid, refunded_cents: 10000 } })
    expect(screen.getByTestId('invoice-refund-label').textContent).toContain('Partly refunded')
  })

  it('shows nothing without an invoice, or an open one without a hosted link', () => {
    const first = renderView(approvedOver, {}, {}, { invoice: null })
    expect(screen.queryByTestId('change-order-pay-invoice')).toBeNull()
    expect(screen.queryByTestId('change-order-invoice-paid')).toBeNull()
    first.unmount()
    renderView(approvedOver, {}, {}, { invoice: { ...invoice, hosted_invoice_url: null } })
    expect(screen.queryByTestId('change-order-pay-invoice')).toBeNull()
  })
})
