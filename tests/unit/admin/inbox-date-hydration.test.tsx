import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, within } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminWhatsAppClient } from '@/app/admin/inbox/admin-whatsapp-client'
import { AdminWhatsAppAccounts } from '@/app/admin/inbox/settings/admin-whatsapp-accounts'

vi.mock('next/navigation', () => {
  const router = { refresh: vi.fn(), replace: vi.fn() }
  return { useRouter: () => router, useSearchParams: () => new URLSearchParams() }
})
vi.mock('@/lib/actions/admin-whatsapp', () => ({ loadAdminConversationThread: vi.fn() }))
vi.mock('@/app/admin/inbox/admin-whatsapp-filters', () => ({ AdminWhatsAppFilters: () => null }))
vi.mock('@/lib/actions/admin-whatsapp-accounts', () => ({
  saveWhatsAppAccount: vi.fn(), saveWhatsAppSender: vi.fn(), resolveWhatsAppWelcomeStep: vi.fn(),
  resolveWhatsAppWelcomeTemplate: vi.fn(), setWhatsAppSenderStatus: vi.fn(), removeWhatsAppSender: vi.fn(),
}))

const timestamp = '2026-11-24T01:15:00.000Z'
const conversation = {
  id: 'synthetic-inbox-row', company_id: 'synthetic-tenant',
  contact_phone: '+12025550101', contact_name: 'Synthetic contact',
  last_message_at: timestamp, last_inbound_at: null,
  last_message_preview: 'Synthetic message preview', unread_count: 0,
  company_name: 'Synthetic company',
}

function inbox(row: typeof conversation | (Omit<typeof conversation, 'last_message_at'> & { last_message_at: null })) {
  return <AdminWhatsAppClient
    conversations={[row]}
    initialConversationId={null}
    filters={{ companyId: undefined, senderId: undefined, q: undefined, status: undefined, unreadOnly: false, dateFrom: undefined, dateTo: undefined }}
    paginationSlot={null}
  />
}

function accounts(verifiedAt: string | null) {
  const companyId = 'synthetic-tenant'
  return <AdminWhatsAppAccounts
    companyId={companyId}
    companySearch=""
    companies={[{ id: companyId, name: 'Synthetic company' }]}
    configs={[]}
    senders={[{
      id: 'synthetic-sender', company_id: companyId, maskedPhone: '···0101', linkedAccountLabel: null,
      needsPhoneOnlyConfirmation: false, status: 'pending_review', created_by_admin: true,
      verified_at: verifiedAt, welcome_template_claim_until: null, welcome_template_needs_review: false,
    }]}
  />
}

function mockBrowserDate(serverDate: string, browserDate: string) {
  const realFormatter = Date.prototype.toLocaleDateString
  let formatted = serverDate
  vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (this: Date, locales, options) {
    if (this.getTime() === Date.parse(timestamp)) return formatted
    return realFormatter.call(this, locales, options)
  })
  return () => { formatted = browserDate }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('admin inbox timestamp hydration', () => {
  it('hydrates the server row without recovery and then renders the browser-local timestamp', async () => {
    const serverDate = 'Nov 24, 01:15 AM · server locale'
    const browserDate = 'Nov 23, 05:15 PM · browser locale'
    const switchToBrowser = mockBrowserDate(serverDate, browserDate)

    const tree = inbox(conversation)
    const container = document.createElement('div')
    document.body.append(container)
    let root: Root | undefined
    try {
      container.innerHTML = renderToString(tree)
      const serverRow = within(container).getByRole('button', { name: /Synthetic contact/ })
      const serverText = serverRow.textContent
      const onRecoverableError = vi.fn()
      switchToBrowser()

      await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError }) })

      expect(onRecoverableError).not.toHaveBeenCalled()
      expect(serverText).not.toContain(serverDate)
      expect(serverText).not.toContain(browserDate)
      const hydratedRow = within(container).getByRole('button', { name: /Synthetic contact/ })
      expect(hydratedRow).toBe(serverRow)
      expect(within(hydratedRow).getByText(browserDate, { exact: true })).toBeVisible()
      expect(hydratedRow).not.toHaveTextContent(serverDate)
    } finally {
      if (root) await act(async () => { root?.unmount() })
      container.remove()
    }
  })

  it('keeps the missing-date placeholder without asking the formatter', () => {
    const formatter = vi.spyOn(Date.prototype, 'toLocaleDateString')
    const { getByRole } = render(inbox({ ...conversation, last_message_at: null }))
    const row = getByRole('button', { name: /Synthetic contact/ })

    expect(within(row).getByText('—', { exact: true })).toBeVisible()
    expect(formatter).not.toHaveBeenCalled()
  })
})

describe('admin sender verification date hydration', () => {
  it('keeps the existing verified row during hydration and renders the browser-local date', async () => {
    const serverDate = '11/24/2026'
    const browserDate = '11/23/2026'
    const switchToBrowser = mockBrowserDate(serverDate, browserDate)
    const tree = accounts(timestamp)
    const container = document.createElement('div')
    document.body.append(container)
    let root: Root | undefined
    try {
      container.innerHTML = renderToString(tree)
      const serverRow = within(container).getByRole('row', { name: /0101/ })
      const serverVerifiedText = within(serverRow).getAllByRole('cell')[2].textContent
      const onRecoverableError = vi.fn()
      switchToBrowser()

      await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError }) })

      expect(onRecoverableError).not.toHaveBeenCalled()
      expect(serverVerifiedText).toBe('—')
      const hydratedRow = within(container).getByRole('row', { name: /0101/ })
      expect(hydratedRow).toBe(serverRow)
      const dateCell = within(hydratedRow).getByRole('cell', { name: browserDate })
      expect(dateCell).toBeVisible()
      expect(dateCell.querySelector('svg')).not.toBeNull()
      expect(within(hydratedRow).queryByText('Not verified')).not.toBeInTheDocument()
      expect(within(hydratedRow).getByRole('button', { name: 'Activate sender' })).toBeEnabled()
    } finally {
      if (root) await act(async () => { root?.unmount() })
      container.remove()
    }
  })

  it('keeps an unverified sender labeled and ineligible for activation without formatting a date', () => {
    const formatter = vi.spyOn(Date.prototype, 'toLocaleDateString')
    const { getByRole } = render(accounts(null))
    const row = getByRole('row', { name: /0101/ })

    expect(within(row).getByRole('cell', { name: 'Not verified' })).toBeVisible()
    expect(within(row).getByRole('button', { name: 'Activate sender' })).toBeDisabled()
    expect(formatter).not.toHaveBeenCalled()
  })
})
