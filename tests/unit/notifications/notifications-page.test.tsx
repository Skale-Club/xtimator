import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { NotificationList } from '@/components/notifications/NotificationList'
import type { NotificationRow } from '@/lib/notifications/queries'

/**
 * Phase 77 plan 05 — Unit tests for the /notifications full-page client list.
 * Covers NOTIF-06 + ≥5 cases toward NOTIF-12.
 */

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/notifications',
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

function makeRow(over: Partial<NotificationRow> = {}): NotificationRow {
  const base: NotificationRow = {
    id: `n_${Math.random().toString(36).slice(2, 8)}`,
    company_id: 'co_1',
    user_id: 'u_1',
    event_type: 'estimate.viewed',
    title: 'Estimate viewed',
    body: 'Customer Acme viewed your estimate',
    link_url: '/estimates/abc',
    resource_type: 'estimate',
    resource_id: 'abc',
    metadata: {},
    read_at: null,
    pinned: false,
    created_at: new Date(Date.now() - 60_000).toISOString(),
    expires_at: null,
  }
  return { ...base, ...over }
}

describe('components/notifications/NotificationList (NOTIF-06 + NOTIF-12)', () => {
  beforeEach(() => {
    pushMock.mockClear()
  })

  it('renders all provided items', () => {
    const items = [
      makeRow({ id: 'a', title: 'First' }),
      makeRow({ id: 'b', title: 'Second' }),
      makeRow({ id: 'c', title: 'Third' }),
    ]
    render(
      <NotificationList
        items={items}
        nextCursor={null}
        category={null}
        unreadOnly={false}
      />,
    )
    const list = screen.getByTestId('notifications-list')
    const rows = within(list).getAllByTestId('notification-item')
    expect(rows).toHaveLength(3)
    expect(screen.getByText('First')).toBeTruthy()
    expect(screen.getByText('Third')).toBeTruthy()
  })

  it('shows empty state when items array is empty (default filter)', () => {
    render(
      <NotificationList
        items={[]}
        nextCursor={null}
        category={null}
        unreadOnly={false}
      />,
    )
    const empty = screen.getByTestId('notifications-empty')
    expect(empty.textContent).toMatch(/No notifications yet/i)
  })

  it('shows tailored empty state per active category filter', () => {
    render(
      <NotificationList
        items={[]}
        nextCursor={null}
        category="billing"
        unreadOnly={false}
      />,
    )
    expect(
      screen.getByTestId('notifications-empty').textContent,
    ).toMatch(/No billing notifications yet/i)
  })

  it('shows tailored empty state when unread + category combined', () => {
    render(
      <NotificationList
        items={[]}
        nextCursor={null}
        category="estimate"
        unreadOnly={true}
      />,
    )
    expect(
      screen.getByTestId('notifications-empty').textContent,
    ).toMatch(/No unread estimates notifications/i)
  })

  it('search input filters list client-side by title or body', () => {
    const items = [
      makeRow({ id: '1', title: 'Payment received', body: 'You got $500' }),
      makeRow({ id: '2', title: 'Estimate viewed', body: 'Acme opened it' }),
      makeRow({ id: '3', title: 'Trial expiring', body: 'Renew soon' }),
    ]
    render(
      <NotificationList
        items={items}
        nextCursor={null}
        category={null}
        unreadOnly={false}
      />,
    )
    const search = screen.getByTestId('filter-search') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'acme' } })
    const visible = screen.getAllByTestId('notification-item')
    expect(visible).toHaveLength(1)
    expect(screen.getByText('Estimate viewed')).toBeTruthy()
    expect(screen.queryByText('Payment received')).toBeNull()
  })

  it('search with no matches shows the "no match" empty state', () => {
    const items = [makeRow({ title: 'Estimate viewed', body: 'a body' })]
    render(
      <NotificationList
        items={items}
        nextCursor={null}
        category={null}
        unreadOnly={false}
      />,
    )
    const search = screen.getByTestId('filter-search') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'xyznomatch' } })
    expect(
      screen.getByTestId('notifications-empty').textContent,
    ).toMatch(/No notifications match/i)
  })

  it('clicking a category chip navigates with ?category= param', () => {
    render(
      <NotificationList
        items={[makeRow()]}
        nextCursor={null}
        category={null}
        unreadOnly={false}
      />,
    )
    fireEvent.click(screen.getByTestId('filter-cat-billing'))
    expect(pushMock).toHaveBeenCalledTimes(1)
    const arg = pushMock.mock.calls[0][0] as string
    expect(arg).toMatch(/category=billing/)
    expect(arg).not.toMatch(/cursor=/)
  })

  it('clicking Unread-only toggle navigates with ?unread=1', () => {
    render(
      <NotificationList
        items={[makeRow()]}
        nextCursor={null}
        category={null}
        unreadOnly={false}
      />,
    )
    fireEvent.click(screen.getByTestId('filter-unread'))
    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock.mock.calls[0][0]).toMatch(/unread=1/)
  })

  it('renders Load more button when nextCursor is provided and pushes ?cursor=', () => {
    render(
      <NotificationList
        items={[makeRow()]}
        nextCursor="2026-05-19T12:00:00Z"
        category={null}
        unreadOnly={false}
      />,
    )
    const btn = screen.getByTestId('notifications-load-more')
    fireEvent.click(btn)
    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock.mock.calls[0][0]).toMatch(/cursor=2026-05-19T12%3A00%3A00Z/)
  })

  it('unread row carries data-unread="true" and read row data-unread="false"', () => {
    render(
      <NotificationList
        items={[
          makeRow({ id: 'u', read_at: null, title: 'Unread one' }),
          makeRow({
            id: 'r',
            read_at: new Date().toISOString(),
            title: 'Read one',
          }),
        ]}
        nextCursor={null}
        category={null}
        unreadOnly={false}
      />,
    )
    const rows = screen.getAllByTestId('notification-item')
    expect(rows[0].getAttribute('data-unread')).toBe('true')
    expect(rows[1].getAttribute('data-unread')).toBe('false')
  })
})
