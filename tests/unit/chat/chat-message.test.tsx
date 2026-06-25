/**
 * CHATUI-01 — chat-message renders one UIMessage by switching over message.parts.
 *
 * Wave-0 RED scaffold: components/chat/chat-message.tsx is built by Plan 125-01.
 * The behavioral assertions are it.todo until that component lands; turning them
 * green is 125-01's automated verify. One real expect locks the part-type
 * contract so the file runs and the gap is visible.
 */
import { describe, it, expect } from 'vitest'

describe('ChatMessage part rendering (CHATUI-01)', () => {
  // Contract anchor (runs now): the part `type` discriminators the renderer must switch on.
  it('knows the part-type discriminators it must render', () => {
    const textPart = { type: 'text', text: 'hello' }
    const toolPart = { type: 'tool-createEstimate', state: 'input-available' }
    expect(textPart.type).toBe('text')
    expect(toolPart.type.startsWith('tool-')).toBe(true)
  })

  it.todo('renders a text part as a markdown bubble')
  it.todo('renders a tool-<name> input-available part as a progress chip')
  it.todo('renders a tool-createEstimate output-available part as the estimate card slot')
  it.todo('renders a tool output-error part as an error chip')
})
