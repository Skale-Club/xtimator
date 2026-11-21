import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { GenerateInvoiceDialog } from '@/components/workspace/estimate/generate-invoice-dialog'
import { IssuedInvoicesPanel } from '@/components/workspace/estimate/issued-invoices-panel'
import type { InvoiceRow } from '@/lib/queries/invoice'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))
const getInvoicingPreview = vi.fn()
vi.mock('@/lib/actions/invoice', () => ({
  generateInvoice: vi.fn(),
  getInvoicingPreview: (...a: unknown[]) => getInvoicingPreview(...a),
}))

beforeEach(() => getInvoicingPreview.mockReset())
afterEach(() => cleanup())

function openDialog() {
  render(
    <GenerateInvoiceDialog
      estimateId="est-1"
      currencyCode="USD"
      estimateTotalCents={348600}
      depositType="amount"
      depositValue={1000}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /Generate invoice/ }))
}

describe('GenerateInvoiceDialog - contract preview', () => {
  it('shows the breakdown and the contract-aware balance when change orders are approved', async () => {
    getInvoicingPreview.mockResolvedValue({
      data: {
        currencyCode: 'USD',
        estimateTotalCents: 348600,
        configuredDepositCents: 100000,
        approvedChangeOrders: [{ id: 'co-1', number: 1, totalCents: 51500 }],
        liveInvoices: [],
      },
    })
    openDialog()
    fireEvent.click(await screen.findByRole('button', { name: 'Balance' }))
    const breakdown = await screen.findByTestId('invoice-breakdown')
    expect(breakdown.textContent).toBe('Estimate $3,486.00 − Deposit $1,000.00 + Change orders $515.00')
    expect(screen.getByText('$3,001.00')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Full' }))
    expect(screen.getByTestId('invoice-breakdown').textContent).toContain('Estimate + change orders')
    expect(screen.getByText('$4,001.00')).toBeTruthy()
  })

  it('looks exactly like today (no breakdown) without change orders', async () => {
    getInvoicingPreview.mockResolvedValue({
      data: {
        currencyCode: 'USD',
        estimateTotalCents: 348600,
        configuredDepositCents: 100000,
        approvedChangeOrders: [],
        liveInvoices: [],
      },
    })
    openDialog()
    await waitFor(() => expect(getInvoicingPreview).toHaveBeenCalledWith('est-1'))
    fireEvent.click(screen.getByRole('button', { name: 'Balance' }))
    expect(screen.queryByTestId('invoice-breakdown')).toBeNull()
    expect(screen.getByText('$2,486.00')).toBeTruthy()
  })

  it('after a live deposit the Balance tab shows the remainder and hides the percent picker', async () => {
    getInvoicingPreview.mockResolvedValue({
      data: {
        currencyCode: 'USD',
        estimateTotalCents: 100000,
        accepted: true,
        configuredDepositCents: null,
        approvedChangeOrders: [],
        liveInvoices: [{ kind: 'deposit', amount_cents: 30000, change_order_id: null }],
      },
    })
    render(<GenerateInvoiceDialog estimateId="est-1" currencyCode="USD" estimateTotalCents={100000} />)
    fireEvent.click(screen.getByRole('button', { name: /Generate invoice/ }))
    await waitFor(() => expect(getInvoicingPreview).toHaveBeenCalled())
    fireEvent.click(await screen.findByRole('button', { name: 'Balance' }))
    await screen.findByTestId('balance-remainder-note')
    expect(screen.queryByLabelText('Custom percentage')).toBeNull()
    expect(screen.getByText('$700.00')).toBeTruthy()
    expect(screen.queryByTestId('not-accepted-note')).toBeNull()

    // Deposit keeps its picker (no configured deposit).
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }))
    expect(screen.getByLabelText('Custom percentage')).toBeTruthy()
  })

  it('keeps the percent picker for Balance when no deposit invoice exists', async () => {
    getInvoicingPreview.mockResolvedValue({
      data: {
        currencyCode: 'USD',
        estimateTotalCents: 100000,
        accepted: true,
        configuredDepositCents: null,
        approvedChangeOrders: [],
        liveInvoices: [],
      },
    })
    render(<GenerateInvoiceDialog estimateId="est-1" currencyCode="USD" estimateTotalCents={100000} />)
    fireEvent.click(screen.getByRole('button', { name: /Generate invoice/ }))
    await waitFor(() => expect(getInvoicingPreview).toHaveBeenCalled())
    fireEvent.click(await screen.findByRole('button', { name: 'Balance' }))
    expect(screen.getByLabelText('Custom percentage')).toBeTruthy()
    expect(screen.queryByTestId('balance-remainder-note')).toBeNull()
  })

  it('says so, in one muted line, when the client has not accepted the estimate yet', async () => {
    getInvoicingPreview.mockResolvedValue({
      data: {
        currencyCode: 'USD',
        estimateTotalCents: 100000,
        accepted: false,
        configuredDepositCents: null,
        approvedChangeOrders: [],
        liveInvoices: [],
      },
    })
    render(<GenerateInvoiceDialog estimateId="est-1" currencyCode="USD" estimateTotalCents={100000} />)
    fireEvent.click(screen.getByRole('button', { name: /Generate invoice/ }))
    const note = await screen.findByTestId('not-accepted-note')
    expect(note.textContent).toBe('Your client has not accepted this estimate yet.')
  })

  it('falls back to the live total when the preview fails', async () => {
    getInvoicingPreview.mockResolvedValue({ error: 'Estimate not found' })
    openDialog()
    await waitFor(() => expect(getInvoicingPreview).toHaveBeenCalled())
    expect(screen.queryByTestId('invoice-breakdown')).toBeNull()
    expect(screen.getByText('$3,486.00')).toBeTruthy()
  })
})

describe('IssuedInvoicesPanel - change order kind', () => {
  const row = (over: Partial<InvoiceRow>): InvoiceRow => ({
    id: 'i1',
    estimate_id: 'est-1',
    company_id: 'c1',
    kind: 'change_order',
    change_order_id: 'co-1',
    change_order_number: 3,
    amount_cents: 51500,
    currency_code: 'USD',
    status: 'open',
    stripe_invoice_id: null,
    hosted_invoice_url: null,
    invoice_pdf_url: null,
    paid_at: null,
    created_at: '2026-11-17T00:00:00.000Z',
    ...over,
  } as InvoiceRow)

  it('labels a change order invoice with its number', () => {
    render(<IssuedInvoicesPanel invoices={[row({})]} />)
    expect(screen.getByText(/Change order #3/)).toBeTruthy()
  })

  it('falls back to "Change order" without a number', () => {
    render(<IssuedInvoicesPanel invoices={[row({ change_order_number: null })]} />)
    expect(screen.getByText(/^Change order ·$/)).toBeTruthy()
  })
})
