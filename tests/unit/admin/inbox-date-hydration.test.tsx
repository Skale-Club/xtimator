import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, within } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminWhatsAppClient } from '@/app/admin/inbox/admin-whatsapp-client'

vi.mock('next/navigation', () => {
  const router = { refresh: vi.fn(), replace: vi.fn() }
  return { useRouter: () => router, useSearchParams: () => new URLSearchParams() }
})
vi.mock('@/lib/actions/admin-whatsapp', () => ({ loadAdminConversationThread: vi.fn() }))
vi.mock('@/app/admin/inbox/admin-whatsapp-filters', () => ({ AdminWhatsAppFilters: () => null }))

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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('admin inbox timestamp hydration', () => {
  it('hydrates the server row without recovery and then renders the browser-local timestamp', async () => {
    const serverDate = 'Nov 24, 01:15 AM · server locale'
    const browserDate = 'Nov 23, 05:15 PM · browser locale'
    const realFormatter = Date.prototype.toLocaleDateString
    let formatted = serverDate
    vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (this: Date, locales, options) {
      if (this.getTime() === Date.parse(timestamp)) return formatted
      return realFormatter.call(this, locales, options)
    })

    const tree = inbox(conversation)
    const container = document.createElement('div')
    document.body.append(container)
    let root: Root | undefined
    try {
      container.innerHTML = renderToString(tree)
      const serverRow = within(container).getByRole('button', { name: /Synthetic contact/ })
      const serverText = serverRow.textContent
      const onRecoverableError = vi.fn()
      formatted = browserDate

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
