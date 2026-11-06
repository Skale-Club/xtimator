import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

/**
 * Phase 77 plan 04 — NotificationBell + useNotifications coverage.
 * SEED-059: live updates are bounded polling (no Supabase Realtime).
 *
 * Mocks:
 *  - global fetch (for /api/notifications/list, /:id/read, /mark-all-read)
 *  - next/navigation router for NotificationItem.handleClick
 */

// --- next/navigation mock ---------------------------------------------------

const routerPushSpy = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushSpy }),
}))

// --- Component under test ---------------------------------------------------

import { NotificationBell } from '@/components/notifications/notification-bell'
import { NOTIFICATIONS_POLL_MS } from '@/components/notifications/use-notifications'

// --- Helpers ----------------------------------------------------------------

interface FakeRow {
  id: string
  event_type: string
  title: string
  body: string
  link_url: string | null
  created_at: string
  read_at: string | null
  pinned: boolean
}

function rowFixture(over: Partial<FakeRow> = {}): FakeRow {
  return {
    id: 'n_1',
    event_type: 'estimate.viewed',
    title: 'Estimate viewed',
    body: 'Jane Doe viewed your estimate',
    link_url: '/estimates/abc',
    created_at: new Date().toISOString(),
    read_at: null,
    pinned: false,
    ...over,
  }
}

function mockListResponse(items: FakeRow[]) {
  ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (typeof url === 'string' && url.includes('/api/notifications/list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items, nextCursor: null }),
        } as unknown as Response)
      }
      if (typeof url === 'string' && url.match(/\/api\/notifications\/[^/]+\/read/) && method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 204 } as Response)
      }
      if (typeof url === 'string' && url.includes('/api/notifications/mark-all-read')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ updated: items.length }),
        } as unknown as Response)
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as unknown as Response)
    },
  )
}

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch
  routerPushSpy.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// --- Tests -------------------------------------------------------------------

describe('NotificationBell — initial render & badge', () => {
  it('renders bell with unread badge count from /api/notifications/list', async () => {
    mockListResponse([rowFixture({ id: 'a', read_at: null }), rowFixture({ id: 'b', read_at: null })])
    await act(async () => {
      render(<NotificationBell companyId="co_1" userId="u_1" />)
    })
    await waitFor(() => {
      const badge = screen.getByTestId('notification-bell-badge')
      expect(badge.textContent).toBe('2')
    })
  })

  it('shows "9+" when unreadCount > 9', async () => {
    const many: FakeRow[] = Array.from({ length: 12 }, (_, i) =>
      rowFixture({ id: `n_${i}`, read_at: null }),
    )
    mockListResponse(many)
    await act(async () => {
      render(<NotificationBell companyId="co_1" userId="u_1" />)
    })
    await waitFor(() => {
      expect(screen.getByTestId('notification-bell-badge').textContent).toBe('9+')
    })
  })

  it('hides badge when there are no unread items', async () => {
    mockListResponse([rowFixture({ id: 'a', read_at: new Date().toISOString() })])
    await act(async () => {
      render(<NotificationBell companyId="co_1" userId="u_1" />)
    })
    await waitFor(() => {
      expect(screen.getByTestId('notification-bell').getAttribute('data-unread-count')).toBe('0')
    })
    expect(screen.queryByTestId('notification-bell-badge')).toBeNull()
  })

  it('excludes dropped WhatsApp rows from the list and unread badge', async () => {
    mockListResponse([
      rowFixture({
        id: 'whatsapp',
        event_type: 'whatsapp.inbound',
        title: 'New WhatsApp message',
      }),
      rowFixture({ id: 'estimate', title: 'Estimate viewed' }),
    ])
    await act(async () => {
      render(<NotificationBell companyId="co_1" userId="u_1" />)
    })
    await waitFor(() => {
      expect(screen.getByTestId('notification-bell-badge').textContent).toBe('1')
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('notification-bell'))
    })
    expect(await screen.findByText('Estimate viewed')).toBeTruthy()
    expect(screen.queryByText('New WhatsApp message')).toBeNull()
  })
})

function listCalls() {
  const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
  return fetchMock.mock.calls.filter(
    (c) => typeof c[0] === 'string' && c[0].includes('/api/notifications/list'),
  ).length
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

async function mountAndSettle() {
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(<NotificationBell companyId="co_1" userId="u_1" />)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  return utils
}

describe('NotificationBell - bounded polling (no Realtime)', () => {
  afterEach(() => {
    vi.useRealTimers()
    setVisibility('visible')
  })

  it('polls the list endpoint every 30s while visible and surfaces new rows', async () => {
    vi.useFakeTimers()
    mockListResponse([])
    await mountAndSettle()
    expect(listCalls()).toBe(1)
    expect(screen.getByTestId('notification-bell').getAttribute('data-unread-count')).toBe('0')

    mockListResponse([rowFixture({ id: 'new1', read_at: null })])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS)
    })
    expect(listCalls()).toBe(2)
    expect(screen.getByTestId('notification-bell').getAttribute('data-unread-count')).toBe('1')
  })

  it('pauses while the tab is hidden and refetches immediately when visible again', async () => {
    vi.useFakeTimers()
    mockListResponse([])
    await mountAndSettle()
    act(() => setVisibility('hidden'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS * 3)
    })
    expect(listCalls()).toBe(1)

    await act(async () => {
      setVisibility('visible')
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(listCalls()).toBe(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS)
    })
    expect(listCalls()).toBe(3)
  })

  it('refetches on window focus', async () => {
    vi.useFakeTimers()
    mockListResponse([])
    await mountAndSettle()
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(listCalls()).toBe(2)
  })

  it('stops polling on unmount', async () => {
    vi.useFakeTimers()
    mockListResponse([])
    const utils = await mountAndSettle()
    utils.unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS * 3)
    })
    expect(listCalls()).toBe(1)
  })

  it('keeps dropped WhatsApp rows out of polled results', async () => {
    vi.useFakeTimers()
    mockListResponse([])
    await mountAndSettle()
    mockListResponse([
      rowFixture({ id: 'wa', event_type: 'whatsapp.inbound', title: 'New WhatsApp message' }),
    ])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS)
    })
    expect(screen.getByTestId('notification-bell').getAttribute('data-unread-count')).toBe('0')
  })
})

describe('NotificationBell — markRead flow', () => {
  it('clicking an item PATCHes /api/notifications/[id]/read and decrements badge', async () => {
    const items = [rowFixture({ id: 'click_me', read_at: null, link_url: '/estimates/x' })]
    mockListResponse(items)

    await act(async () => {
      render(<NotificationBell companyId="co_1" userId="u_1" />)
    })
    await waitFor(() => {
      expect(screen.getByTestId('notification-bell-badge').textContent).toBe('1')
    })

    // Open popover
    await act(async () => {
      fireEvent.click(screen.getByTestId('notification-bell'))
    })

    // The popover content renders in a Radix portal; await its item.
    const itemBtn = await screen.findByTestId('notification-item')
    await act(async () => {
      fireEvent.click(itemBtn)
    })

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
    const patchCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/api/notifications/click_me/read'),
    )
    expect(patchCall).toBeTruthy()
    expect((patchCall![1] as RequestInit).method).toBe('PATCH')
    expect(routerPushSpy).toHaveBeenCalledWith('/estimates/x')

    // Badge gone (optimistic update)
    await waitFor(() => {
      expect(screen.queryByTestId('notification-bell-badge')).toBeNull()
    })
  })
})
