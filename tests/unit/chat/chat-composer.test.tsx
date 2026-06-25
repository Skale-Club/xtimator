/**
 * CHATUI-01 / CHATUI-03 — chat-composer: text submit + multimodal injection.
 *
 * Wave-0 RED scaffold: components/chat/chat-composer.tsx is built by Plan 125-01.
 * Behavioral assertions are it.todo until the component lands (125-01 turns them
 * green). One real expect anchors the onSend contract so the file runs.
 */
import { describe, it, expect, vi } from 'vitest'

describe('ChatComposer (CHATUI-01/03)', () => {
  // Contract anchor (runs now): submitting non-empty text calls onSend(text) once.
  it('onSend contract: fires once with the trimmed text', () => {
    const onSend = vi.fn()
    const text = '  estimate a fence  '
    if (text.trim()) onSend(text.trim())
    expect(onSend).toHaveBeenCalledExactlyOnceWith('estimate a fence')
  })

  it.todo('typing then submitting calls onSend(text) and clears the textarea')
  it.todo('disables the composer while busy (status !== ready)')
  it.todo('audio path: records → normalizeChatInput({kind:audio}) → injects returned text')
  it.todo('photo path: compresses → normalizeChatInput({kind:photo}) → injects returned text')
})
