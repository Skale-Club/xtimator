/**
 * CHATUI-02 — chat-sidebar: conversation list, new chat, switch.
 *
 * Turned GREEN by Plan 125-01: components/chat/chat-sidebar.tsx renders the
 * server newest-first conversation order as next/link rows to /chat/<id>, plus a
 * "New chat" control that clears the active conversation via onNew.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ChatSidebar } from '@/components/chat/chat-sidebar'
import type { ChatConversationRow } from '@/lib/queries/chat'

// i18n passthrough so copy assertions run on plain English.
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

// next/link → a plain anchor carrying href so we can assert the route target.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

function conv(id: string, updated_at: string, title: string | null = null): ChatConversationRow {
  return {
    id,
    company_id: 'company-1',
    user_id: 'user-1',
    title,
    created_at: updated_at,
    updated_at,
  }
}

// listConversations already returns updated_at DESC; the sidebar renders as-is.
const CONVERSATIONS = [
  conv('b', '2026-06-25T10:00:00Z', 'Newer chat'),
  conv('a', '2026-06-24T10:00:00Z', 'Older chat'),
]

describe('ChatSidebar (CHATUI-02)', () => {
  // Contract anchor: conversations arrive newest-updated first; render as-is.
  it('preserves the server newest-first ordering', () => {
    expect(CONVERSATIONS.map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('renders conversation titles newest-first as links to /chat/<id>', () => {
    const { container } = render(
      <ChatSidebar conversations={CONVERSATIONS} activeId={null} onNew={() => {}} />,
    )
    const links = Array.from(container.querySelectorAll('a[href^="/chat/"]'))
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/chat/b', '/chat/a'])
    const html = container.innerHTML
    // Newer row's title appears before the older row's title in source order.
    expect(html.indexOf('Newer chat')).toBeLessThan(html.indexOf('Older chat'))
  })

  it('renders an "Untitled chat" fallback when a conversation has no title', () => {
    const { container } = render(
      <ChatSidebar
        conversations={[conv('x', '2026-06-25T10:00:00Z', null)]}
        activeId={null}
        onNew={() => {}}
      />,
    )
    expect(container.innerHTML).toContain('Untitled chat')
  })

  it('renders a "New chat" button that fires onNew', () => {
    const onNew = vi.fn()
    const { getByText } = render(
      <ChatSidebar conversations={CONVERSATIONS} activeId={null} onNew={onNew} />,
    )
    fireEvent.click(getByText('New chat'))
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('highlights the active conversation row', () => {
    const { container } = render(
      <ChatSidebar conversations={CONVERSATIONS} activeId={'a'} onNew={() => {}} />,
    )
    const activeLink = container.querySelector('a[href="/chat/a"]')
    expect(activeLink?.className).toContain('bg-muted/60')
  })

  it('shows an empty state when there are no conversations', () => {
    const { container } = render(
      <ChatSidebar conversations={[]} activeId={null} onNew={() => {}} />,
    )
    expect(container.innerHTML).toContain('No conversations yet.')
    expect(container.querySelector('a[href^="/chat/"]')).toBeNull()
  })
})
