import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { ChangeOrderEditor, type ChangeOrderEditorProps } from '@/components/workspace/change-orders/change-order-editor'
import type { ChangeOrderActions } from '@/components/workspace/change-orders/change-order-actions'
import type { ChangeOrder, ContractSummary } from '@/lib/change-orders/types'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}))
const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
    dismiss: vi.fn(),
  },
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))
vi.mock('@/lib/actions/change-order', () => ({
  createChangeOrder: vi.fn(),
  getChangeOrderAction: vi.fn(),
  saveChangeOrder: vi.fn(),
  deleteChangeOrder: vi.fn(),
  markChangeOrderShared: vi.fn(),
  recordChangeOrderResponse: vi.fn(),
  getContractSummaryAction: vi.fn(),
}))

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  push.mockClear()
  refresh.mockClear()
  toastError.mockClear()
})

const MINUS = '−'

const CONTRACT: ContractSummary = {
  estimateId: 'est-1',
  currencyCode: 'USD',
  estimateNumber: 'SK-1045',
  acceptedAt: '2026-11-06T15:00:00.000Z',
  signedOnline: false,
  baseTotal: 3486,
  changeOrders: [],
  approvedTotal: 800,
  pendingTotal: 0,
  contractTotal: 4286,
}

function buildChangeOrder(over: Partial<ChangeOrder> = {}): ChangeOrder {
  return {
    id: 'co-1',
    company_id: 'c1',
    project_id: 'proj-1',
    estimate_id: 'est-1',
    number: 2,
    title: '',
    reason: null,
    extra_days: null,
    status: 'draft',
    share_token: 'tok-1',
    sent_at: null,
    viewed_at: null,
    view_count: 0,
    responded_at: null,
    client_response: null,
    tax_rate: 0,
    subtotal: 0,
    tax_amount: 0,
    total: 0,
    currency_code: 'USD',
    created_at: '2026-11-15T00:00:00.000Z',
    updated_at: '2026-11-16T08:00:00.000Z',
    items: [],
    hasSignature: false,
    signature: null,
    ...over,
  }
}

function fakeActions(over: Partial<ChangeOrderActions> = {}): ChangeOrderActions {
  return {
    createChangeOrder: vi.fn(),
    getContractSummary: vi.fn().mockResolvedValue({ data: CONTRACT }),
    saveChangeOrder: vi.fn().mockResolvedValue({
      data: { updated_at: '2026-11-16T08:00:05.000Z', subtotal: 0, tax_amount: 0, total: 0 },
    }),
    deleteChangeOrder: vi.fn().mockResolvedValue({ data: { id: 'co-1' } }),
    markChangeOrderShared: vi.fn().mockResolvedValue({ data: { sent_at: '2026-11-16T09:00:00.000Z' } }),
    recordChangeOrderResponse: vi.fn().mockResolvedValue({
      data: { client_response: null, responded_at: null, updated_at: '2026-11-16T09:00:00.000Z' },
    }),
    invoiceChangeOrder: vi.fn().mockResolvedValue({ data: { invoiceId: 'inv-1' } }),
    ...over,
  } as ChangeOrderActions
}

function Editor({
  co,
  actions,
  invoicing,
}: {
  co: ChangeOrder
  actions: ChangeOrderActions
  invoicing?: ChangeOrderEditorProps['invoicing']
}) {
  return (
    <ChangeOrderEditor
      changeOrder={co}
      contract={CONTRACT}
      project={{ id: 'proj-1', name: 'Two-bedroom repaint', clientName: 'Ava Thompson' }}
      company={{ name: 'Acme Co', logo_url: null, phone: null, digital_signature_enabled: true }}
      invoicing={invoicing}
      actions={actions}
    />
  )
}

function renderEditor(
  co: ChangeOrder,
  actions: ChangeOrderActions = fakeActions(),
  invoicing?: ChangeOrderEditorProps['invoicing'],
) {
  const view = render(<Editor co={co} actions={actions} invoicing={invoicing} />)
  return { actions, ...view }
}

const lineAt = (index: number) => screen.getAllByTestId('change-order-line')[index]

describe('ChangeOrderEditor', () => {
  it('focuses a new line on commit and never steals the next field after typing begins', () => {
    renderEditor(buildChangeOrder())
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    const description = screen.getByLabelText('Item 1 description')
    expect(document.activeElement).toBe(description)
    fireEvent.change(description, { target: { value: 'Additional gate hardware' } })
    const quantity = screen.getByLabelText('Item 1 quantity')
    act(() => quantity.focus())
    act(() => vi.advanceTimersByTime(31))
    expect(document.activeElement).toBe(quantity)
    fireEvent.change(quantity, { target: { value: '2' } })
    expect((description as HTMLInputElement).value).toBe('Additional gate hardware')
    expect((quantity as HTMLInputElement).value).toBe('2')

    fireEvent.click(screen.getByRole('button', { name: 'Add credit' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Item 2 description'))
    expect((description as HTMLInputElement).value).toBe('Additional gate hardware')
    expect((quantity as HTMLInputElement).value).toBe('2')
  })

  it('Add item and Add credit change the totals with the right signs', () => {
    renderEditor(buildChangeOrder())

    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    fireEvent.change(screen.getByLabelText('Item 1 unit price'), { target: { value: '800' } })
    expect(screen.getByTestId('change-order-subtotal').textContent).toBe('+$800.00')
    expect(screen.getByTestId('change-order-new-total').textContent).toBe('$5,086.00')

    fireEvent.click(screen.getByRole('button', { name: 'Add credit' }))
    fireEvent.change(screen.getByLabelText('Item 2 credit amount'), { target: { value: '50' } })
    expect(lineAt(1).getAttribute('data-credit')).toBe('true')
    expect(within(lineAt(1)).getByTestId('change-order-line-total').textContent).toBe(`${MINUS}$50.00`)
    expect(screen.getByTestId('change-order-subtotal').textContent).toBe('+$750.00')
    expect(screen.getByTestId('change-order-new-total').textContent).toBe('$5,036.00')
    // The "Current contract" row comes from the loaded summary.
    expect(screen.getByText('$4,286.00')).toBeTruthy()
    expect(screen.getByTestId('change-order-top-bar-total').textContent).toBe('+$750.00')
  })

  it('flips the sign when a line is toggled to a credit', () => {
    renderEditor(buildChangeOrder())
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    fireEvent.change(screen.getByLabelText('Item 1 unit price'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Item 1 is a credit' }))
    expect(screen.getByTestId('change-order-subtotal').textContent).toBe(`${MINUS}$100.00`)
    expect(screen.getByTestId('change-order-top-bar-total').textContent).toBe(`${MINUS}$100.00`)
  })

  it('shows the tax line and the taxable box only when the change order has a tax rate', () => {
    renderEditor(buildChangeOrder({ tax_rate: 0.1 }))
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    fireEvent.change(screen.getByLabelText('Item 1 unit price'), { target: { value: '200' } })
    expect(screen.getByLabelText('Item 1 taxable')).toBeTruthy()
    expect(screen.getByTestId('change-order-tax').textContent).toBe('+$20.00')
    expect(screen.getByTestId('change-order-new-total').textContent).toBe('$4,506.00')
  })

  it('has no taxable box without a tax rate', () => {
    renderEditor(buildChangeOrder({ tax_rate: 0 }))
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    expect(screen.queryByLabelText('Item 1 taxable')).toBeNull()
    expect(screen.queryByTestId('change-order-tax')).toBeNull()
  })

  it('autosaves 1.5 s after the last edit with the expected payload', async () => {
    const { actions } = renderEditor(buildChangeOrder())

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Garage painting' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add credit' }))
    fireEvent.change(screen.getByLabelText('Item 1 description'), { target: { value: 'Skip trim' } })
    fireEvent.change(screen.getByLabelText('Item 1 credit amount'), { target: { value: '50' } })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499)
    })
    expect(actions.saveChangeOrder).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(actions.saveChangeOrder).toHaveBeenCalledTimes(1)
    expect(actions.saveChangeOrder).toHaveBeenCalledWith({
      id: 'co-1',
      expectedUpdatedAt: '2026-11-16T08:00:00.000Z',
      title: 'Garage painting',
      reason: null,
      extra_days: null,
      items: [
        { id: undefined, description: 'Skip trim', quantity: 1, unit: null, unit_price: -50, taxable: true, sort_order: 0 },
      ],
    })

    // The next save compares against the updated_at the server returned.
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Garage painting 2' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(actions.saveChangeOrder).toHaveBeenCalledTimes(2)
    expect(vi.mocked(actions.saveChangeOrder).mock.calls[1][0].expectedUpdatedAt).toBe('2026-11-16T08:00:05.000Z')
  })

  it('a conflict shows one Reload toast and pauses autosave', async () => {
    const { actions } = renderEditor(
      buildChangeOrder(),
      fakeActions({
        saveChangeOrder: vi.fn().mockResolvedValue({ error: 'changed elsewhere', conflict: true }) as never,
      }),
    )
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(actions.saveChangeOrder).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledTimes(1)
    const [, options] = toastError.mock.calls[0]
    expect(options.id).toBe('change-order-conflict')
    expect(options.action.label).toBe('Reload')
    options.action.onClick()
    expect(refresh).toHaveBeenCalled()

    // More typing must not fire more saves while the conflict is unresolved.
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'AB' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(actions.saveChangeOrder).toHaveBeenCalledTimes(1)
    // The typed text is still there.
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('AB')
  })

  it('switches to read-only when the server says the change order is locked', async () => {
    renderEditor(
      buildChangeOrder(),
      fakeActions({ saveChangeOrder: vi.fn().mockResolvedValue({ error: 'change_order_locked' }) as never }),
    )
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Add item' })).toBeNull()
    expect(refresh).toHaveBeenCalled()
  })

  it('renders an approved change order read-only with the lock banner and signer', () => {
    renderEditor(
      buildChangeOrder({
        title: 'Extra coat',
        status: 'accepted',
        client_response: 'accepted',
        responded_at: '2026-11-16T15:00:00.000Z',
        hasSignature: true,
        signature: {
          signer_name: 'Ava Thompson',
          signed_at: '2026-11-16T15:00:00.000Z',
          signature_data: 'data:image/png;base64,AAAA',
        },
        items: [{ id: 'i1', description: 'Third coat', quantity: 1, unit: null, unit_price: 800, total: 800, taxable: true, sort_order: 0 }],
      }),
    )
    const banner = screen.getByTestId('change-order-lock-banner')
    expect(banner.textContent).toContain('Approved.')
    expect(banner.textContent).toContain('Signed by Ava Thompson')
    expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Item 1 description') as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Add item' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add credit' })).toBeNull()
    expect(screen.queryByTestId('change-order-delete')).toBeNull()
    expect(screen.getByAltText('Client signature')).toBeTruthy()
  })

  it('"Revise and reopen" on a declined change order clears the answer', async () => {
    const { actions } = renderEditor(
      buildChangeOrder({
        status: 'declined',
        client_response: 'declined',
        responded_at: '2026-11-16T15:00:00.000Z',
        sent_at: '2026-11-16T09:00:00.000Z',
      }),
    )
    expect(screen.getByTestId('change-order-lock-banner').textContent).toContain('Declined.')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Revise and reopen' }))
    })
    expect(actions.recordChangeOrderResponse).toHaveBeenCalledWith('co-1', null)
    expect(refresh).toHaveBeenCalled()
    // The answer is gone, so the paper is editable again.
    expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(false)
  })

  it('offers Delete only for a draft that was never shared', () => {
    const first = renderEditor(buildChangeOrder())
    expect(screen.getByTestId('change-order-delete')).toBeTruthy()
    first.unmount()
    renderEditor(buildChangeOrder({ status: 'sent', sent_at: '2026-11-16T09:00:00.000Z' }))
    expect(screen.queryByTestId('change-order-delete')).toBeNull()
  })

  it('shows no status chip for a draft and a "Sent · viewed" chip once the client looked', () => {
    const first = renderEditor(buildChangeOrder())
    expect(screen.queryByTestId('change-order-status-chip')).toBeNull()
    first.unmount()
    renderEditor(buildChangeOrder({ status: 'sent', sent_at: '2026-11-16T09:00:00.000Z', view_count: 2 }))
    expect(screen.getByTestId('change-order-status-chip').textContent).toContain('Sent · viewed 2×')
  })
})

describe('ChangeOrderEditor - invoicing', () => {
  const approved = (over: Partial<ChangeOrder> = {}) =>
    buildChangeOrder({
      status: 'accepted',
      client_response: 'accepted',
      responded_at: '2026-11-16T15:00:00.000Z',
      sent_at: '2026-11-16T09:00:00.000Z',
      total: 515,
      subtotal: 515,
      items: [
        { id: 'i1', description: 'Extra work', quantity: 1, unit: null, unit_price: 515, total: 515, taxable: false, sort_order: 0 },
      ],
      ...over,
    })
  const INVOICE = {
    id: 'inv-1',
    status: 'open' as const,
    amount_cents: 51500,
    currency_code: 'USD',
    hosted_invoice_url: 'https://invoice.stripe.com/i/test',
    paid_at: null,
  }

  it('shows the Invoice button only for approved + payments + positive + no invoice', () => {
    const ok = renderEditor(approved(), fakeActions(), { paymentsEnabled: true, invoice: null })
    expect(screen.getByTestId('change-order-invoice')).toBeTruthy()
    ok.unmount()

    const noPayments = renderEditor(approved(), fakeActions(), { paymentsEnabled: false, invoice: null })
    expect(screen.queryByTestId('change-order-invoice')).toBeNull()
    noPayments.unmount()

    const draft = renderEditor(buildChangeOrder({ total: 515 }), fakeActions(), { paymentsEnabled: true, invoice: null })
    expect(screen.queryByTestId('change-order-invoice')).toBeNull()
    draft.unmount()

    const hasInvoice = renderEditor(approved(), fakeActions(), { paymentsEnabled: true, invoice: INVOICE })
    expect(screen.queryByTestId('change-order-invoice')).toBeNull()
    hasInvoice.unmount()

    renderEditor(approved({ total: -100, subtotal: -100, items: [{ id: 'i2', description: 'Skip a coat', quantity: 1, unit: null, unit_price: -100, total: -100, taxable: false, sort_order: 0 }] }), fakeActions(), { paymentsEnabled: true, invoice: null })
    expect(screen.queryByTestId('change-order-invoice')).toBeNull()
  })

  it('confirms the amount and sends the invoice, then refreshes', async () => {
    const { actions } = renderEditor(approved(), fakeActions(), { paymentsEnabled: true, invoice: null })
    fireEvent.click(screen.getByTestId('change-order-invoice'))
    expect(screen.getByTestId('change-order-invoice-amount').textContent).toBe('$515.00')
    expect(screen.getByText('Invoice for change order #2')).toBeTruthy()
    expect(screen.getByText('The client gets a Stripe invoice by email, due in 7 days.')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByTestId('change-order-invoice-send'))
    })
    expect(actions.invoiceChangeOrder).toHaveBeenCalledWith('co-1')
    expect(toastSuccess).toHaveBeenCalledWith('Invoice sent')
    expect(refresh).toHaveBeenCalled()
  })

  it('toasts the server error and does not refresh', async () => {
    const actions = fakeActions({ invoiceChangeOrder: vi.fn().mockResolvedValue({ error: 'Stripe is not connected' }) })
    renderEditor(approved(), actions, { paymentsEnabled: true, invoice: null })
    fireEvent.click(screen.getByTestId('change-order-invoice'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('change-order-invoice-send'))
    })
    expect(toastError).toHaveBeenCalledWith('Stripe is not connected')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('shows a compact invoice row with a View invoice link instead of the button', () => {
    renderEditor(approved(), fakeActions(), { paymentsEnabled: true, invoice: INVOICE })
    const row = screen.getByTestId('change-order-invoice-row')
    expect(row.textContent).toContain('$515.00')
    expect(row.textContent).toContain('Open')
    expect((within(row).getByRole('link', { name: 'View invoice' }) as HTMLAnchorElement).href).toBe('https://invoice.stripe.com/i/test')
  })

  it('shows Paid for a paid invoice', () => {
    renderEditor(approved(), fakeActions(), { paymentsEnabled: true, invoice: { ...INVOICE, status: 'paid', paid_at: '2026-11-17T10:00:00.000Z' } })
    expect(screen.getByTestId('change-order-invoice-row').textContent).toContain('Paid')
  })

  it('shows a one-line note for an approved credit', () => {
    renderEditor(approved({ total: -100, subtotal: -100, items: [{ id: 'i2', description: 'Skip a coat', quantity: 1, unit: null, unit_price: -100, total: -100, taxable: false, sort_order: 0 }] }), fakeActions(), { paymentsEnabled: true, invoice: null })
    expect(screen.getByTestId('change-order-credit-note').textContent).toBe('Credits are applied to the balance invoice.')
  })

  it('leaves drafts, sent and declined change orders alone', () => {
    const first = renderEditor(buildChangeOrder(), fakeActions(), { paymentsEnabled: true, invoice: null })
    expect(screen.queryByTestId('change-order-credit-note')).toBeNull()
    expect(screen.getByTestId('change-order-share')).toBeTruthy()
    first.unmount()
    renderEditor(
      buildChangeOrder({ status: 'declined', client_response: 'declined', total: 50, responded_at: '2026-11-16T15:00:00.000Z', sent_at: '2026-11-16T09:00:00.000Z' }),
      fakeActions(),
      { paymentsEnabled: true, invoice: null },
    )
    expect(screen.queryByTestId('change-order-invoice')).toBeNull()
  })
})
