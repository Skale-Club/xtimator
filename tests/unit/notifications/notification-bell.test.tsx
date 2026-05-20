import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

/**
 * Phase 77 plan 04 — NotificationBell + useNotifications coverage.
 *
 * Mocks:
 *  - global fetch (for /api/notifications/list, /:id/read, /mark-all-read)
 *  - @/lib/supabase/client → createClient returning a fake channel
 *  - next/navigation router for NotificationItem.handleClick
 */

// --- Supabase channel mock --------------------------------------------------

let lastChannelHandler: ((payload: { new: Record<string, unknown> }) => void) | null = null
const removeChannelSpy = vi.fn()
const subscribeSpy = vi.fn().mockReturnValue(undefined)

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: (_name: string) => {
      const chain = {
        on: (
          _event: string,
          _opts: unknown,
          handler: (payload: { new: Record<string, unknown> }) => void,
        ) => {
          lastChannelHandler = handler
          return chain
        },
        subscribe: () => {
          subscribeSpy()
          return chain
        },
      }
      return chain
    },
    removeChannel: (_c: unknown) => removeChannelSpy(),
  }),
}))

// --- next/navigation mock ---------------------------------------------------

const routerPushSpy = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushSpy }),
}))

// --- Component under test ---------------------------------------------------

import { NotificationBell } from '@/components/notifications/notification-bell'

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
  lastChannelHandler = null
  removeChannelSpy.mockClear()
  subscribeSpy.mockClear()
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
})

describe('NotificationBell — Supabase Realtime subscription', () => {
  it('subscribes on mount and removes channel on unmount', async () => {
    mockListResponse([])
    let utils: ReturnType<typeof render> | null = null
    await act(async () => {
      utils = render(<NotificationBell companyId="co_1" userId="u_1" />)
    })
    expect(subscribeSpy).toHaveBeenCalledTimes(1)
    expect(typeof lastChannelHandler).toBe('function')
    utils!.unmount()
    expect(removeChannelSpy).toHaveBeenCalledTimes(1)
  })

  it('increments unread badge live when realtime INSERT arrives (debounced 300ms)', async () => {
    vi.useFakeTimers()
    mockListResponse([])
    await act(async () => {
      render(<NotificationBell companyId="co_1" userId="u_1" />)
    })
    // After mount, fetch resolves. Run any microtasks.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // Simulate realtime push
    act(() => {
      lastChannelHandler!({
        new: { ...rowFixture({ id: 'new1', read_at: null }), user_id: null },
      })
    })
    // Before debounce — still 0
    expect(screen.getByTestId('notification-bell').getAttribute('data-unread-count')).toBe('0')

    // Advance past debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })
    expect(screen.getByTestId('notification-bell').getAttribute('data-unread-count')).toBe('1')
    vi.useRealTimers()
  })

  it('ignores realtime INSERTs targeted at a different user', async () => {
    vi.useFakeTimers()
    mockListResponse([])
    await act(async () => {
      render(<NotificationBell companyId="co_1" userId="u_1" />)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    act(() => {
      lastChannelHandler!({
        new: { ...rowFixture({ id: 'other', read_at: null }), user_id: 'u_other' },
      })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })
    expect(screen.getByTestId('notification-bell').getAttribute('data-unread-count')).toBe('0')
    vi.useRealTimers()
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
