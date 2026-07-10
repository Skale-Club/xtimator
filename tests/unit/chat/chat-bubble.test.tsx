/**
 * ChatBubble — the floating launcher/panel that activates the in-app chat.
 *
 * Contract under test:
 *   - Closed = launcher only; NO chat data is fetched until first open (the
 *     bubble is mounted in the app-shell layout on every page — it must be free).
 *   - Non-entitled tier → the panel shows the upgrade card and fetches nothing.
 *   - Entitled → first open lazily loads the history list and resumes the most
 *     recent conversation into the (stubbed) ChatThread.
 *   - Close hides the panel but keeps it mounted (state survives reopen);
 *     "New chat" resets the thread to a fresh null-id state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const listChatConversations = vi.fn()
const getChatThread = vi.fn()
const deleteChatConversation = vi.fn()
vi.mock('@/lib/actions/chat', () => ({
  listChatConversations: (...a: unknown[]) => listChatConversations(...a),
  getChatThread: (...a: unknown[]) => getChatThread(...a),
  deleteChatConversation: (...a: unknown[]) => deleteChatConversation(...a),
}))

// The real ChatThread drives useChat/transport — out of scope here. The stub
// surfaces the props the bubble is responsible for wiring.
vi.mock('@/components/chat/chat-thread', () => ({
  ChatThread: ({ conversationId, embedded }: { conversationId: string | null; embedded?: boolean }) => (
    <div data-testid="chat-thread" data-conversation-id={conversationId ?? ''} data-embedded={String(!!embedded)} />
  ),
}))

import { ChatBubble } from '@/components/chat/chat-bubble'

beforeEach(() => {
  listChatConversations.mockReset()
  getChatThread.mockReset()
  deleteChatConversation.mockReset()
  deleteChatConversation.mockResolvedValue(true)
})

describe('ChatBubble', () => {
  it('renders only the launcher while closed and fetches nothing', () => {
    const { getByLabelText, queryByRole } = render(<ChatBubble chatEnabled={true} />)
    expect(getByLabelText('Open chat assistant')).toBeTruthy()
    expect(queryByRole('dialog')).toBeNull()
    expect(listChatConversations).not.toHaveBeenCalled()
  })

  it('shows the upgrade card (and fetches nothing) when the tier is not entitled', () => {
    const { getByLabelText, getByText, queryByTestId } = render(
      <ChatBubble chatEnabled={false} />,
    )
    fireEvent.click(getByLabelText('Open chat assistant'))
    expect(getByText('In-app chat is a Pro feature')).toBeTruthy()
    expect(getByText('Upgrade your plan').closest('a')?.getAttribute('href')).toBe(
      '/settings/billing',
    )
    expect(queryByTestId('chat-thread')).toBeNull()
    expect(listChatConversations).not.toHaveBeenCalled()
  })

  it('lazily loads history and resumes the latest conversation on first open', async () => {
    listChatConversations.mockResolvedValue([
      { id: 'conv-2', title: 'Newer', updated_at: '2026-07-01T10:00:00Z' },
      { id: 'conv-1', title: 'Older', updated_at: '2026-06-01T10:00:00Z' },
    ])
    getChatThread.mockResolvedValue({ id: 'conv-2', messages: [], votes: {} })

    const { getByLabelText, getByTestId } = render(<ChatBubble chatEnabled={true} />)
    fireEvent.click(getByLabelText('Open chat assistant'))

    await waitFor(() => {
      expect(getByTestId('chat-thread').getAttribute('data-conversation-id')).toBe('conv-2')
    })
    expect(getByTestId('chat-thread').getAttribute('data-embedded')).toBe('true')
    expect(listChatConversations).toHaveBeenCalledTimes(1)
    expect(getChatThread).toHaveBeenCalledWith('conv-2')
  })

  it('close hides the panel but keeps it mounted; reopen does not refetch', async () => {
    listChatConversations.mockResolvedValue([])

    const { getByLabelText, getByRole, queryByLabelText } = render(
      <ChatBubble chatEnabled={true} />,
    )
    fireEvent.click(getByLabelText('Open chat assistant'))
    await waitFor(() => expect(listChatConversations).toHaveBeenCalledTimes(1))

    fireEvent.click(getByLabelText('Close chat'))
    // Panel stays in the DOM (hidden) so in-flight chat state survives.
    expect(getByRole('dialog', { hidden: true })).toBeTruthy()
    expect(queryByLabelText('Open chat assistant')).toBeTruthy()

    fireEvent.click(getByLabelText('Open chat assistant'))
    await waitFor(() => expect(listChatConversations).toHaveBeenCalledTimes(1))
  })

  it('"New chat" resets the thread to a fresh null-id state', async () => {
    listChatConversations.mockResolvedValue([
      { id: 'conv-1', title: 'Older', updated_at: '2026-06-01T10:00:00Z' },
    ])
    getChatThread.mockResolvedValue({ id: 'conv-1', messages: [], votes: {} })

    const { getByLabelText, getByTestId } = render(<ChatBubble chatEnabled={true} />)
    fireEvent.click(getByLabelText('Open chat assistant'))
    await waitFor(() => {
      expect(getByTestId('chat-thread').getAttribute('data-conversation-id')).toBe('conv-1')
    })

    fireEvent.click(getByLabelText('New chat'))
    expect(getByTestId('chat-thread').getAttribute('data-conversation-id')).toBe('')
  })

  it('deletes a conversation from the history menu and resets the thread when active', async () => {
    listChatConversations.mockResolvedValue([
      { id: 'conv-1', title: 'Only chat', updated_at: '2026-06-01T10:00:00Z' },
    ])
    getChatThread.mockResolvedValue({ id: 'conv-1', messages: [], votes: {} })

    const { getByLabelText, getByTestId } = render(<ChatBubble chatEnabled={true} />)
    fireEvent.click(getByLabelText('Open chat assistant'))
    await waitFor(() => {
      expect(getByTestId('chat-thread').getAttribute('data-conversation-id')).toBe('conv-1')
    })

    // Open the history dropdown (Radix opens on pointerdown), then delete the row.
    fireEvent.pointerDown(
      getByLabelText('Chat history'),
      { pointerId: 1, button: 0, ctrlKey: false },
    )
    await waitFor(() => expect(getByLabelText('Delete conversation')).toBeTruthy())
    fireEvent.click(getByLabelText('Delete conversation'))

    await waitFor(() => expect(deleteChatConversation).toHaveBeenCalledWith('conv-1'))
    // The deleted conversation was active → the thread resets to a fresh chat.
    expect(getByTestId('chat-thread').getAttribute('data-conversation-id')).toBe('')
  })
})
