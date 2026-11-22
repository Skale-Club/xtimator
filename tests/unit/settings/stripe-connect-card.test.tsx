import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { StripeConnectCard } from '@/components/settings/stripe-connect-card'

const connected = { kind: 'connected', displayName: 'Demo Biz', email: null } as const

describe('StripeConnectCard disconnect confirmation', () => {
  it('asks for confirmation with the open invoice count before disconnecting', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<StripeConnectCard state={connected} feePct={0.01} openInvoiceCount={3} />)
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(screen.getByTestId('disconnect-open-invoices').textContent).toContain(
      'You have 3 open invoice(s). After you disconnect, Xtimator can no longer track their payment. Void them first if your client should not pay them.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('disconnects straight away when no invoice is open', () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: false, message: 'x' }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<StripeConnectCard state={connected} feePct={0.01} openInvoiceCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(screen.queryByTestId('disconnect-open-invoices')).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('/api/stripe/connect/disconnect', { method: 'POST' })
    vi.unstubAllGlobals()
  })
})
