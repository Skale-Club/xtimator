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
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

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
