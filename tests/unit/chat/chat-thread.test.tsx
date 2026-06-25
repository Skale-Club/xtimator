/**
 * CHATUI-01 — chat-thread: the useChat surface (STATIC-SOURCE contract).
 *
 * Wave-0 RED scaffold: components/chat/chat-thread.tsx is built by Plan 125-01.
 * When it lands, these static-source assertions lock the v6 useChat wiring:
 *   - imports useChat from @ai-sdk/react (NOT from `ai`)
 *   - imports DefaultChatTransport from `ai`
 *   - transport targets api: '/api/chat' with body: { conversationId }
 *   - calls sendMessage({ text ... }) (v6 send shape)
 *   - does NOT use the removed pre-v6 handleSubmit, nor prepareSendMessagesRequest
 *     (which would send only the last message and break the full-array route)
 *
 * The assertions are it.todo until the file exists (125-01 turns them green);
 * one real expect anchors the expected source path so the gap is visible.
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const THREAD_PATH = resolve(process.cwd(), 'components/chat/chat-thread.tsx')

describe('ChatThread useChat wiring (CHATUI-01, static-source)', () => {
  // Anchor (runs now): records the path the static contract will read once built.
  it('targets the chat-thread component path', () => {
    expect(THREAD_PATH.endsWith('chat-thread.tsx')).toBe(true)
    // Visibility: the scaffold is RED until 125-01 creates the component.
    expect(existsSync(THREAD_PATH)).toBe(false)
  })

  it.todo("imports useChat from '@ai-sdk/react'")
  it.todo("imports DefaultChatTransport from 'ai'")
  it.todo("transport sets api: '/api/chat' and body: { conversationId }")
  it.todo('calls sendMessage({ text')
  it.todo('does NOT contain handleSubmit or prepareSendMessagesRequest')
})
