/**
 * CHATUI-01 — chat-message renders one UIMessage by switching over message.parts.
 *
 * Turned GREEN by Plan 125-01: components/chat/chat-message.tsx switches over
 * message.parts (text → markdown bubble; tool-<name>/dynamic-tool → ChatToolPart),
 * and components/chat/chat-tool-part.tsx renders a labeled progress chip while a
 * tool call is in flight (input-available) and the result on output-available.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ChatMessage } from '@/components/chat/chat-message'

// i18n passthrough so copy assertions run on plain English.
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

// react-markdown → plain text passthrough (avoids ESM/markdown rendering noise).
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('remark-gfm', () => ({ default: () => {} }))

// Minimal UIMessage-shaped fixtures (only the fields the renderer reads).
function msg(role: 'user' | 'assistant', parts: unknown[]) {
  return { id: 'm1', role, parts } as never
}

describe('ChatMessage part rendering (CHATUI-01)', () => {
  // Contract anchor: the part `type` discriminators the renderer must switch on.
  it('knows the part-type discriminators it must render', () => {
    const textPart = { type: 'text', text: 'hello' }
    const toolPart = { type: 'tool-createEstimate', state: 'input-available' }
    expect(textPart.type).toBe('text')
    expect(toolPart.type.startsWith('tool-')).toBe(true)
  })

  it('renders a text part as a bubble', () => {
    const { container } = render(
      <ChatMessage message={msg('assistant', [{ type: 'text', text: 'hi there' }])} />,
    )
    expect(container.innerHTML).toContain('hi there')
  })

  it('renders a tool-createEstimate input-available part as the "Generating estimate…" chip', () => {
    const { container } = render(
      <ChatMessage
        message={msg('assistant', [{ type: 'tool-createEstimate', state: 'input-available' }])}
      />,
    )
    expect(container.innerHTML).toContain('Generating estimate…')
  })

  it('renders a tool-askKnowledge output-available part as a result (not a progress chip)', () => {
    const { container } = render(
      <ChatMessage
        message={msg('assistant', [
          {
            type: 'tool-askKnowledge',
            state: 'output-available',
            output: { answer: 'pre-treat with enzyme cleaner' },
          },
        ])}
      />,
    )
    const html = container.innerHTML
    expect(html).toContain('pre-treat with enzyme cleaner')
    expect(html).not.toContain('Looking up the answer…')
  })

  it('renders a tool output-error part as an error chip', () => {
    const { container } = render(
      <ChatMessage
        message={msg('assistant', [
          { type: 'tool-listServices', state: 'output-error', errorText: 'boom' },
        ])}
      />,
    )
    expect(container.innerHTML).toContain('boom')
  })
})
