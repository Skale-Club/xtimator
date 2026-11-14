/**
 * CHATUI-01 — chat-thread: the useChat surface (STATIC-SOURCE contract).
 *
 * Turned GREEN by Plan 125-01: components/chat/chat-thread.tsx wires the v6
 * @ai-sdk/react useChat with a DefaultChatTransport. These static-source
 * assertions lock that wiring:
 *   - imports useChat from @ai-sdk/react (NOT from `ai`)
 *   - imports DefaultChatTransport from `ai`
 *   - transport targets api: '/api/chat' with body: { conversationId }
 *   - calls sendMessage({ text ... }) (v6 send shape)
 *   - does NOT use the removed pre-v6 handleSubmit/handleInputChange, nor
 *     prepareSendMessagesRequest (which would send only the last message and
 *     break the full-array convertToModelMessages route).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { UIMessage } from 'ai'
import { ChatThread } from '@/components/chat/chat-thread'

const chat = vi.hoisted(() => ({
  messages: [] as UIMessage[],
  status: 'ready',
  sendMessage: vi.fn(),
  stop: vi.fn(),
  regenerate: vi.fn(),
  create: vi.fn(),
  replace: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@ai-sdk/react', () => ({ useChat: () => chat }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: chat.replace }) }))
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => chat.toastError(...args) } }))
vi.mock('@/lib/i18n/use-translation', () => ({ useTranslation: () => ({ t: (s: string) => s }) }))
vi.mock('@/lib/actions/chat', () => ({
  createChatConversation: (...args: unknown[]) => chat.create(...args),
  voteChatMessage: vi.fn(),
  editChatMessage: vi.fn(),
  truncateChatFrom: vi.fn(),
}))
vi.mock('@/components/chat/chat-composer', () => ({ ChatComposer: () => null }))
vi.mock('@/components/chat/chat-message', () => ({
  ChatMessage: ({ message }: { message: UIMessage }) => <div>{message.id}</div>,
}))

const THREAD_PATH = resolve(process.cwd(), 'components/chat/chat-thread.tsx')

describe('ChatThread useChat wiring (CHATUI-01, static-source)', () => {
  it('targets the chat-thread component path', () => {
    expect(THREAD_PATH.endsWith('chat-thread.tsx')).toBe(true)
    expect(existsSync(THREAD_PATH)).toBe(true)
  })

  const src = () => readFileSync(THREAD_PATH, 'utf8')

  it("imports useChat from '@ai-sdk/react'", () => {
    expect(src()).toMatch(/import\s*\{[^}]*\buseChat\b[^}]*\}\s*from\s*['"]@ai-sdk\/react['"]/)
  })

  it("imports DefaultChatTransport from 'ai'", () => {
    expect(src()).toMatch(/import\s*\{[^}]*\bDefaultChatTransport\b[^}]*\}\s*from\s*['"]ai['"]/)
  })

  it("transport sets api: '/api/chat' and body: { conversationId }", () => {
    const s = src()
    expect(s).toContain("api: '/api/chat'")
    expect(s).toMatch(/body:\s*\{\s*conversationId/)
  })

  it('calls sendMessage({ text', () => {
    expect(src()).toMatch(/sendMessage\(\s*\{\s*text/)
  })

  it('does NOT contain handleSubmit, handleInputChange or prepareSendMessagesRequest', () => {
    const s = src()
    expect(s).not.toContain('handleSubmit')
    expect(s).not.toContain('handleInputChange')
    expect(s).not.toContain('prepareSendMessagesRequest')
  })
})

describe('ChatThread interactions', () => {
  const scrollTo = vi.fn()

  beforeEach(() => {
    chat.messages = []
    chat.status = 'ready'
    chat.sendMessage.mockReset()
    chat.replace.mockReset()
    chat.create.mockReset().mockResolvedValue({ id: 'created-conversation' })
    chat.toastError.mockReset()
    scrollTo.mockReset()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo })
  })

  it('shows the compact greeting and sends the full starter prompt with the created conversation', async () => {
    const onConversationCreated = vi.fn()
    const { getByText } = render(
      <ChatThread conversationId={null} initialMessages={[]} embedded onConversationCreated={onConversationCreated} />,
    )
    expect(getByText('Xtimator AI')).toBeTruthy()
    fireEvent.click(getByText('Create an estimate'))
    await waitFor(() => expect(chat.sendMessage).toHaveBeenCalledWith(
      { text: 'Create an estimate for a new job' },
      { body: { conversationId: 'created-conversation' } },
    ))
    expect(chat.create).toHaveBeenCalledWith('Create an estimate for a new job')
    expect(onConversationCreated).toHaveBeenCalledWith('created-conversation')
    expect(chat.replace).not.toHaveBeenCalled()
  })

  it('scrolls only its conversation container and stops following after the user scrolls up', () => {
    const { getByRole, rerender } = render(<ChatThread conversationId="c1" initialMessages={[]} />)
    const log = getByRole('log')
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo.mock.contexts[0]).toBe(log)
    Object.defineProperties(log, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    })
    fireEvent.scroll(log)
    chat.messages = [{ id: 'new-answer', role: 'assistant', parts: [{ type: 'text', text: 'answer' }] }]
    rerender(<ChatThread conversationId="c1" initialMessages={[]} />)
    expect(scrollTo).toHaveBeenCalledTimes(1)

    log.scrollTop = 800
    fireEvent.scroll(log)
    chat.status = 'streaming'
    rerender(<ChatThread conversationId="c1" initialMessages={[]} />)
    expect(scrollTo).toHaveBeenCalledTimes(2)
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: 'smooth' })
  })

  it('gates starter prompts during conversation creation and recovers from failure', async () => {
    let rejectCreation!: (error: Error) => void
    chat.create.mockImplementation(() => new Promise((_resolve, reject) => { rejectCreation = reject }))
    const { getByText } = render(<ChatThread conversationId={null} initialMessages={[]} embedded />)
    fireEvent.click(getByText('Create an estimate'))
    fireEvent.click(getByText('Recent estimates'))
    expect(chat.create).toHaveBeenCalledTimes(1)
    expect((getByText('Recent estimates') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => rejectCreation(new Error('offline')))
    expect(chat.toastError).toHaveBeenCalledWith('Could not send the message. Please try again.')
    expect((getByText('Recent estimates') as HTMLButtonElement).disabled).toBe(false)
    expect(chat.sendMessage).not.toHaveBeenCalled()
  })
})
