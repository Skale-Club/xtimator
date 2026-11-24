import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { ContractCard } from '@/components/workspace/change-orders/contract-card'
import type { ChangeOrderActions } from '@/components/workspace/change-orders/change-order-actions'
import type { ContractSummary } from '@/lib/change-orders/types'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}))
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))
// The card pulls its default actions from the server module; the tests inject fakes.
vi.mock('@/lib/actions/change-order', () => ({
  createChangeOrder: vi.fn(),
  getChangeOrderAction: vi.fn(),
  saveChangeOrder: vi.fn(),
  deleteChangeOrder: vi.fn(),
  markChangeOrderShared: vi.fn(),
  recordChangeOrderResponse: vi.fn(),
  getContractSummaryAction: vi.fn(),
}))

afterEach(() => {
  cleanup()
  push.mockClear()
  toastError.mockClear()
})

function summary(over: Partial<ContractSummary> = {}): ContractSummary {
  return {
    estimateId: 'est-1',
    currencyCode: 'USD',
    estimateNumber: 'SK-1045',
    acceptedAt: '2026-11-06T15:00:00.000Z',
    signedOnline: true,
    baseTotal: 3486,
    changeOrders: [
      { id: 'co-1', number: 1, title: 'Garage painting', status: 'accepted', total: 800, sent_at: null, responded_at: '2026-11-10T15:00:00.000Z', view_count: 2, invoice_status: null },
      { id: 'co-2', number: 2, title: '', status: 'sent', total: -150, sent_at: '2026-11-12T15:00:00.000Z', responded_at: null, view_count: 3, invoice_status: null },
    ],
    approvedTotal: 800,
    pendingTotal: -150,
    contractTotal: 4286,
    ...over,
  }
}

function fakeActions(over: Partial<ChangeOrderActions> = {}, data: ContractSummary | null = summary()) {
  return {
    getContractSummary: vi.fn().mockResolvedValue({ data }),
    createChangeOrder: vi.fn().mockResolvedValue({ data: { id: 'co-9', number: 9 } }),
    ...over,
  }
}

describe('ContractCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists the accepted estimate, each change order with a signed total, and the contract total', async () => {
    const actions = fakeActions()
    render(<ContractCard estimateId="est-1" projectId="proj-1" actions={actions} />)
    await screen.findByTestId('contract-card')

    expect(actions.getContractSummary).toHaveBeenCalledWith('est-1')
    expect(screen.getByText('Accepted estimate')).toBeTruthy()
    expect(screen.getByText('$3,486.00')).toBeTruthy()
    expect(screen.getByText('Change order #1 · Garage painting')).toBeTruthy()
    expect(screen.getByText('+$800.00')).toBeTruthy()
    // Untitled fallback, pending status line and negative total
    expect(screen.getByText('Change order #2 · Untitled')).toBeTruthy()
    expect(screen.getByText('Sent · viewed 3×')).toBeTruthy()
    expect(screen.getByText('−$150.00')).toBeTruthy()
    expect(screen.getByTestId('contract-total').textContent).toBe('$4,286.00')
  })

  it('explains what a pending change order does to the contract', async () => {
    render(<ContractCard estimateId="est-1" projectId="proj-1" actions={fakeActions()} />)
    await screen.findByTestId('contract-card')
    // 4,286 approved contract + (-150) pending
    expect(screen.getByTestId('contract-note').textContent).toBe(
      'If #2 is approved, the contract becomes $4,136.00.',
    )
  })

  it('invites the first change order when there are none', async () => {
    const empty = summary({ changeOrders: [], approvedTotal: 0, pendingTotal: 0, contractTotal: 3486 })
    render(<ContractCard estimateId="est-1" projectId="proj-1" actions={fakeActions({}, empty)} />)
    await screen.findByTestId('contract-card')
    expect(screen.getByTestId('contract-note').textContent).toContain('No change orders yet.')
  })

  it('"New change order" creates one and navigates to its page', async () => {
    const actions = fakeActions()
    render(<ContractCard estimateId="est-1" projectId="proj-1" actions={actions} />)
    const button = await screen.findByRole('button', { name: 'New change order' })
    fireEvent.click(button)
    expect((button as HTMLButtonElement).disabled).toBe(true)
    await waitFor(() => expect(push).toHaveBeenCalledWith('/projects/proj-1/change-orders/co-9'))
    expect(actions.createChangeOrder).toHaveBeenCalledWith('est-1')
  })

  it('toasts and re-enables the button when creating fails', async () => {
    const actions = fakeActions({ createChangeOrder: vi.fn().mockResolvedValue({ error: 'nope' }) as never })
    render(<ContractCard estimateId="est-1" projectId="proj-1" actions={actions} />)
    const button = (await screen.findByRole('button', { name: 'New change order' })) as HTMLButtonElement
    fireEvent.click(button)
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(push).not.toHaveBeenCalled()
    await waitFor(() => expect(button.disabled).toBe(false))
  })

  it('opens a change order when its row is clicked', async () => {
    render(<ContractCard estimateId="est-1" projectId="proj-1" actions={fakeActions()} />)
    fireEvent.click(await screen.findByTestId('contract-row-2'))
    expect(push).toHaveBeenCalledWith('/projects/proj-1/change-orders/co-2')
  })

  it('reloads the summary when refreshKey changes', async () => {
    const actions = fakeActions()
    const { rerender } = render(<ContractCard estimateId="est-1" projectId="proj-1" refreshKey="a" actions={actions} />)
    await screen.findByTestId('contract-card')
    rerender(<ContractCard estimateId="est-1" projectId="proj-1" refreshKey="b" actions={actions} />)
    await waitFor(() => expect(actions.getContractSummary).toHaveBeenCalledTimes(2))
  })

  it('renders nothing when the estimate is not accepted', async () => {
    render(<ContractCard estimateId="est-1" projectId="proj-1" actions={fakeActions({}, null)} />)
    await waitFor(() => expect(screen.queryByTestId('contract-card-loading')).toBeNull())
    expect(screen.queryByTestId('contract-card')).toBeNull()
  })
})

describe('ContractCard - invoice badges', () => {
  it('badges a change order billed on its own as Invoiced or Paid, next to the amount', async () => {
    const base = summary()
    const data = summary({
      changeOrders: [
        { ...base.changeOrders[0], invoice_status: 'open' },
        { ...base.changeOrders[1], status: 'accepted', invoice_status: 'paid' },
        { id: 'co-3', number: 3, title: 'Plain', status: 'accepted', total: 20, sent_at: null, responded_at: null, view_count: 0, invoice_status: null },
      ],
    })
    render(<ContractCard estimateId="est-1" projectId="proj-1" actions={fakeActions({}, data)} />)
    await screen.findByTestId('contract-card')
    expect(screen.getByTestId('contract-row-invoice-1').textContent).toBe('Invoiced')
    expect(screen.getByTestId('contract-row-invoice-2').textContent).toBe('Paid')
    expect(screen.queryByTestId('contract-row-invoice-3')).toBeNull()
    // Same flex line as the amount (one shrink-0 group), so it fits 360 px.
    const badge = screen.getByTestId('contract-row-invoice-1')
    expect(badge.parentElement?.textContent).toContain('+$800.00')
  })
})
