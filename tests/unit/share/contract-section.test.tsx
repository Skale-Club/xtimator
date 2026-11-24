import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import React from 'react'
import { ContractSection } from '@/components/share/contract-section'
import type { ContractSummary } from '@/lib/change-orders/types'

function row(over: Partial<ContractSummary['changeOrders'][number]>): ContractSummary['changeOrders'][number] {
  return { id: 'x', number: 1, title: '', status: 'sent', total: 0, sent_at: null, responded_at: null, view_count: 0, invoice_status: null, ...over }
}

function summary(over: Partial<ContractSummary> = {}): ContractSummary {
  return {
    estimateId: 'e1',
    currencyCode: 'USD',
    estimateNumber: 'SK-1045',
    acceptedAt: '2026-01-10T12:00:00Z',
    signedOnline: true,
    baseTotal: 10000,
    changeOrders: [
      row({ id: 'a', number: 1, title: 'Garage painting', status: 'accepted', total: 1100 }),
      row({ id: 'b', number: 2, title: 'Extra outlet', status: 'sent', total: 250 }),
      row({ id: 'c', number: 3, title: '', status: 'declined', total: -400 }),
    ],
    approvedTotal: 1100,
    pendingTotal: 250,
    contractTotal: 11100,
    ...over,
  }
}

describe('ContractSection', () => {
  it('lists each change order with title, number, status chip, amount and link', () => {
    render(<ContractSection contract={summary()} links={{ a: '/change-order/ta', b: '/change-order/tb' }} />)
    expect(screen.getByRole('heading', { name: 'Change orders' })).toBeTruthy()
    const rows = screen.getAllByTestId('co-row')
    expect(rows).toHaveLength(3)

    expect(rows[0].textContent).toContain('Garage painting')
    expect(rows[0].textContent).toContain('Change order #1')
    expect(within(rows[0]).getByTestId('co-status').textContent).toBe('Approved')
    expect(within(rows[0]).getByTestId('co-amount').textContent).toBe('$1,100.00')
    expect(rows[0].getAttribute('href')).toBe('/change-order/ta')

    expect(within(rows[1]).getByTestId('co-status').textContent).toBe('Sent')
    expect(rows[1].getAttribute('href')).toBe('/change-order/tb')

    // untitled row falls back to the number; credit is red with a minus; no token = no link
    expect(rows[2].textContent).toContain('Change order #3')
    expect(within(rows[2]).getByTestId('co-status').textContent).toBe('Declined')
    expect(within(rows[2]).getByTestId('co-amount').textContent).toBe('−$400.00')
    expect(within(rows[2]).getByTestId('co-amount').className).toContain('text-red')
    expect(rows[2].getAttribute('href')).toBeNull()
  })

  it('shows the contract total and the awaiting count', () => {
    render(<ContractSection contract={summary()} links={{}} />)
    expect(screen.getByTestId('contract-total').textContent).toBe('$11,100.00')
    expect(screen.getByTestId('contract-awaiting').textContent).toBe('Awaiting your approval: 1')
  })

  it('omits the awaiting line when nothing is pending', () => {
    render(
      <ContractSection
        contract={summary({ changeOrders: [row({ id: 'a', title: 'X', status: 'accepted', total: 100 })] })}
        links={{}}
      />,
    )
    expect(screen.queryByTestId('contract-awaiting')).toBeNull()
  })

  it('renders nothing without change orders, and never shows a draft', () => {
    const { container, rerender } = render(<ContractSection contract={summary({ changeOrders: [] })} links={{}} />)
    expect(container.firstChild).toBeNull()
    rerender(
      <ContractSection
        contract={summary({ changeOrders: [row({ id: 'd', title: 'Draft one', status: 'draft', total: 5 })] })}
        links={{}}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})
