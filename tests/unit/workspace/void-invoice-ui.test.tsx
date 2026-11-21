import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const { refresh, toast } = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))
const voidInvoice = vi.hoisted(() => vi.fn())
vi.mock('@/lib/actions/invoice-void', () => ({ voidInvoice: (...a: unknown[]) => voidInvoice(...a) }))

import { IssuedInvoicesPanel } from '@/components/workspace/estimate/issued-invoices-panel'
import { ChangeOrderInvoiceRow } from '@/components/workspace/change-orders/change-order-invoice-row'
import type { InvoiceRow } from '@/lib/queries/invoice'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const inv = (over: Partial<InvoiceRow>): InvoiceRow =>
  ({
    id: 'i1',
    estimate_id: 'est-1',
    company_id: 'c1',
    kind: 'full',
    change_order_id: null,
    change_order_number: null,
    amount_cents: 1000,
    currency_code: 'USD',
    status: 'open',
    stripe_invoice_id: 'in_1',
    hosted_invoice_url: null,
    invoice_pdf_url: null,
    paid_at: null,
    created_at: '2026-11-17T00:00:00.000Z',
    ...over,
  }) as InvoiceRow

describe('IssuedInvoicesPanel void', () => {
  it.each(['paid', 'void', 'uncollectible', 'draft'] as const)('shows no Void button for %s', (status) => {
    render(<IssuedInvoicesPanel invoices={[inv({ status })]} />)
    expect(screen.queryByTestId('void-invoice')).toBeNull()
  })

  it('shows a muted Void status for a void invoice', () => {
    render(<IssuedInvoicesPanel invoices={[inv({ status: 'void' })]} />)
    expect(screen.getByText('Void')).toBeTruthy()
  })

  it('confirms, voids, toasts and refreshes', async () => {
    voidInvoice.mockResolvedValue({ success: true })
    render(<IssuedInvoicesPanel invoices={[inv({})]} />)
    fireEvent.click(screen.getByTestId('void-invoice'))
    expect(screen.getByText('Void this invoice?')).toBeTruthy()
    expect(screen.getByText('Your client will no longer be able to pay it. This cannot be undone.')).toBeTruthy()
    expect(voidInvoice).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Void invoice' }))
    await waitFor(() => expect(voidInvoice).toHaveBeenCalledWith('i1'))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Invoice voided'))
    expect(refresh).toHaveBeenCalled()
  })

  it('Cancel closes without voiding', () => {
    render(<IssuedInvoicesPanel invoices={[inv({})]} />)
    fireEvent.click(screen.getByTestId('void-invoice'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(voidInvoice).not.toHaveBeenCalled()
  })

  it('shows the returned error and does not refresh', async () => {
    voidInvoice.mockResolvedValue({ error: 'A paid invoice cannot be voided. Refund it in Stripe instead.' })
    render(<IssuedInvoicesPanel invoices={[inv({})]} />)
    fireEvent.click(screen.getByTestId('void-invoice'))
    fireEvent.click(screen.getByRole('button', { name: 'Void invoice' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('A paid invoice cannot be voided. Refund it in Stripe instead.'),
    )
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('ChangeOrderInvoiceRow void', () => {
  const co = (status: 'open' | 'paid') => ({
    id: 'ci1',
    status,
    amount_cents: 5000,
    currency_code: 'USD',
    hosted_invoice_url: null,
    paid_at: null,
  })

  it('shows Void only for an open invoice', () => {
    render(<ChangeOrderInvoiceRow invoice={co('paid')} />)
    expect(screen.queryByTestId('void-invoice')).toBeNull()
    cleanup()
    render(<ChangeOrderInvoiceRow invoice={co('open')} />)
    expect(screen.getByTestId('void-invoice')).toBeTruthy()
  })

  it('uses the injected action', async () => {
    const injected = vi.fn().mockResolvedValue({ success: true })
    render(<ChangeOrderInvoiceRow invoice={co('open')} voidInvoice={injected} />)
    fireEvent.click(screen.getByTestId('void-invoice'))
    fireEvent.click(screen.getByRole('button', { name: 'Void invoice' }))
    await waitFor(() => expect(injected).toHaveBeenCalledWith('ci1'))
    expect(voidInvoice).not.toHaveBeenCalled()
  })
})

describe('refund labels on the owner surfaces', () => {
  const coInvoice = (over: Record<string, unknown>) => ({
    id: 'co-inv-1',
    status: 'paid' as const,
    amount_cents: 1000,
    currency_code: 'USD',
    hosted_invoice_url: null,
    paid_at: '2026-11-18T00:00:00.000Z',
    ...over,
  })

  it('panel: no label for a paid invoice that was never refunded', () => {
    render(<IssuedInvoicesPanel invoices={[inv({ status: 'paid', refunded_cents: 0 })]} />)
    expect(screen.queryByTestId('invoice-refund-label')).toBeNull()
  })

  it('panel: Refunded when the whole amount was refunded, status text stays Paid', () => {
    render(<IssuedInvoicesPanel invoices={[inv({ status: 'paid', refunded_cents: 1000, refunded_at: '2026-11-19T00:00:00.000Z' })]} />)
    expect(screen.getByTestId('invoice-refund-label').textContent).toContain('Refunded')
    expect(screen.getByText('Paid')).toBeTruthy()
  })

  it('panel: Partly refunded with the refunded amount', () => {
    render(<IssuedInvoicesPanel invoices={[inv({ status: 'paid', refunded_cents: 250 })]} />)
    const label = screen.getByTestId('invoice-refund-label').textContent ?? ''
    expect(label).toContain('Partly refunded')
    expect(label).toContain('2.50')
  })

  it('change order row: Refunded and Partly refunded', () => {
    const { unmount } = render(<ChangeOrderInvoiceRow invoice={coInvoice({ refunded_cents: 1000 })} />)
    expect(screen.getByTestId('invoice-refund-label').textContent).toContain('Refunded')
    unmount()
    render(<ChangeOrderInvoiceRow invoice={coInvoice({ refunded_cents: 400 })} />)
    const label = screen.getByTestId('invoice-refund-label').textContent ?? ''
    expect(label).toContain('Partly refunded')
    expect(label).toContain('4.00')
  })

  it('change order row: no label without a refund', () => {
    render(<ChangeOrderInvoiceRow invoice={coInvoice({})} />)
    expect(screen.queryByTestId('invoice-refund-label')).toBeNull()
  })
})
