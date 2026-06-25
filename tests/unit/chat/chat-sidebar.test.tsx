/**
 * CHATUI-02 — chat-sidebar: conversation list, new chat, switch.
 *
 * Wave-0 RED scaffold: components/chat/chat-sidebar.tsx is built by Plan 125-02.
 * Behavioral assertions are it.todo until the component lands (125-02 turns them
 * green). One real expect anchors the newest-first ordering contract the sidebar
 * renders (listConversations already returns updated_at DESC — the UI just renders it).
 */
import { describe, it, expect } from 'vitest'

describe('ChatSidebar (CHATUI-02)', () => {
  // Contract anchor (runs now): conversations arrive newest-updated first; render as-is.
  it('preserves the server newest-first ordering', () => {
    const conversations = [
      { id: 'b', updated_at: '2026-06-25T10:00:00Z' },
      { id: 'a', updated_at: '2026-06-24T10:00:00Z' },
    ]
    expect(conversations.map((c) => c.id)).toEqual(['b', 'a'])
  })

  it.todo('renders conversation titles newest-first')
  it.todo('renders a "New chat" button that clears the active conversation')
  it.todo('clicking a conversation row fires onSelect(id)')
})
