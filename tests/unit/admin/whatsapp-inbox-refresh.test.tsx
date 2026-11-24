import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminWhatsAppClient } from '@/app/admin/inbox/admin-whatsapp-client'
import { loadAdminConversationThread } from '@/lib/actions/admin-whatsapp'
import type { WaConversationRow, WaMessageRow } from '@/lib/whatsapp/conversations'

const router = { refresh: vi.fn(), replace: vi.fn() }
let search = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => search,
}))
vi.mock('@/lib/i18n/use-translation', () => ({ useTranslation: () => ({ t: (text: string) => text }) }))
vi.mock('@/lib/actions/admin-whatsapp', () => ({ loadAdminConversationThread: vi.fn() }))
vi.mock('@/app/admin/inbox/admin-whatsapp-filters', () => ({
  AdminWhatsAppFilters: ({ onRefresh }: { onRefresh: () => void }) => (
    <button type="button" onClick={onRefresh}>Refresh inbox filters</button>
  ),
}))
vi.mock('@/components/whatsapp/message-bubble', () => ({
  MessageBubble: ({ m }: { m: WaMessageRow }) => <p>{m.body}</p>,
}))

const loadThread = vi.mocked(loadAdminConversationThread)
type ThreadResponse = Awaited<ReturnType<typeof loadAdminConversationThread>>
const timestamp = '2026-11-23T12:00:00.000Z'

function conversation(id: string, name: string, phone: string, companyId: string): WaConversationRow & { company_name: string } {
  return {
    id, company_id: companyId, company_name: `${name} Company`, contact_name: name, contact_phone: phone,
    client_id: null, owner_phone: null, last_message_at: null, last_message_preview: null,
    last_inbound_at: null, unread_count: 0, created_at: timestamp, updated_at: timestamp,
  }
}

const alfa = conversation('conversation-a', 'Alfa', '+15555550111', 'company-a')
const beta = conversation('conversation-b', 'Beta', '+15555550112', 'company-b')

function thread(row: WaConversationRow, body: string): ThreadResponse {
  return {
    ok: true,
    thread: {
      conversation: row,
      messages: [{
        id: `message-${row.id}`, conversation_id: row.id, company_id: row.company_id,
        direction: 'inbound', msg_type: 'text', body, media_url: null, wa_message_id: null,
        status: null, error_message: null, created_at: timestamp,
      }],
    },
  }
}

function deferredThread() {
  let complete!: (response: ThreadResponse) => void
  const promise = new Promise<ThreadResponse>((resolve) => { complete = resolve })
  return { promise, complete }
}

function inbox() {
  return <AdminWhatsAppClient conversations={[alfa, beta]} initialConversationId={alfa.id} paginationSlot={null}
    filters={{
      companyId: undefined, senderId: undefined, q: undefined, status: undefined,
      unreadOnly: false, dateFrom: undefined, dateTo: undefined,
    }} />
}

beforeEach(() => {
  loadThread.mockReset()
  router.refresh.mockReset()
  router.replace.mockReset().mockImplementation((path: string) => {
    search = new URL(path, 'https://example.test').searchParams
  })
  search = new URLSearchParams()
})

describe('Admin WhatsApp inbox refresh', () => {
  it('reloads the open conversation when the filters refresh button is clicked', async () => {
    loadThread.mockResolvedValueOnce(thread(alfa, 'Initial message'))
      .mockResolvedValueOnce(thread(alfa, 'Updated message'))

    render(inbox())
    expect(await screen.findByText('Initial message')).toBeTruthy()
    expect(loadThread).toHaveBeenCalledWith(alfa.id, alfa.company_id)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh inbox filters' }))

    expect(router.refresh).toHaveBeenCalledOnce()
    expect(await screen.findByText('Updated message')).toBeTruthy()
    expect(loadThread).toHaveBeenCalledTimes(2)
    expect(loadThread).toHaveBeenNthCalledWith(2, alfa.id, alfa.company_id)
    expect(screen.queryByText('Initial message')).toBeNull()
  })

  it('ignores a delayed refresh after the admin selects another conversation', async () => {
    const oldRefresh = deferredThread()
    const nextSelection = deferredThread()
    loadThread.mockResolvedValueOnce(thread(alfa, 'First Alfa message'))
      .mockReturnValueOnce(oldRefresh.promise)
      .mockReturnValueOnce(nextSelection.promise)

    const { rerender } = render(inbox())
    expect(await screen.findByText('First Alfa message')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh inbox filters' }))
    await waitFor(() => expect(loadThread).toHaveBeenNthCalledWith(2, alfa.id, alfa.company_id))

    fireEvent.click(screen.getByText('Beta'))
    expect(router.replace).toHaveBeenCalledWith('/admin/inbox?conversation=conversation-b', { scroll: false })
    rerender(inbox())
    expect(screen.queryByText('First Alfa message')).toBeNull()
    await waitFor(() => expect(loadThread).toHaveBeenNthCalledWith(3, beta.id, beta.company_id))

    await act(async () => nextSelection.complete(thread(beta, 'Current Beta message')))
    expect(screen.getByText('Current Beta message')).toBeTruthy()
    await act(async () => oldRefresh.complete(thread(alfa, 'Delayed Alfa message')))

    expect(screen.getByText('Current Beta message')).toBeTruthy()
    expect(screen.queryByText('Delayed Alfa message')).toBeNull()
    expect(screen.queryByText('First Alfa message')).toBeNull()
  })
})
