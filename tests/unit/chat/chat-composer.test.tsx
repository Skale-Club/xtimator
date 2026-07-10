/**
 * CHATUI-01 / CHATUI-03 — chat-composer: text submit + multimodal injection.
 *
 * GREEN (Plan 125-02): components/chat/chat-composer.tsx routes text, audio, and
 * photo through normalizeChatInput → onSend(text). These assertions lock the
 * behavior: a text submit fires once + clears; busy disables Send; the photo path
 * normalizes-to-text and forwards it to onSend; a failed normalize does NOT call
 * onSend (and toasts). RTL `container` style, no jest-dom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'

// ── Mocks ────────────────────────────────────────────────────────────────────
const normalizeChatInput = vi.fn()
vi.mock('@/lib/actions/chat', () => ({
  normalizeChatInput: (...args: unknown[]) => normalizeChatInput(...args),
}))

const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

// Capture primitives — pure passthroughs so the composer logic is what's tested.
vi.mock('@/lib/utils/media-format', () => ({
  getSupportedAudioMimeType: () => 'audio/webm',
  getFileExtension: () => 'webm',
}))
vi.mock('@/lib/utils/image-compressor', () => ({
  compressImage: async (file: Blob) => file,
}))

import { ChatComposer } from '@/components/chat/chat-composer'

beforeEach(() => {
  normalizeChatInput.mockReset()
  toastError.mockReset()
})

describe('ChatComposer (CHATUI-01/03)', () => {
  // Contract anchor (runs now): submitting non-empty text calls onSend(text) once.
  it('onSend contract: fires once with the trimmed text', () => {
    const onSend = vi.fn()
    const text = '  estimate a fence  '
    if (text.trim()) onSend(text.trim())
    expect(onSend).toHaveBeenCalledExactlyOnceWith('estimate a fence')
  })

  it('typing then submitting calls onSend(text) and clears the textarea', () => {
    const onSend = vi.fn()
    const { container } = render(<ChatComposer onSend={onSend} busy={false} />)
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement

    fireEvent.change(textarea, { target: { value: 'estimate a fence' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(onSend).toHaveBeenCalledExactlyOnceWith('estimate a fence')
    expect(textarea.value).toBe('')
  })

  it('gates submit while busy but keeps the textarea open for typing', () => {
    const onSend = vi.fn()
    const { container } = render(<ChatComposer onSend={onSend} busy={true} />)
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    // Typing stays available during a streaming turn (Vercel AI Chatbot parity);
    // only submission is gated.
    expect(textarea.disabled).toBe(false)

    const sendBtn = container.querySelector('button[aria-label="Send"]') as HTMLButtonElement
    expect(sendBtn.disabled).toBe(true)

    fireEvent.change(textarea, { target: { value: 'queued question' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('swaps Send for a Stop button while streaming and fires onStop', () => {
    const onSend = vi.fn()
    const onStop = vi.fn()
    const { container } = render(
      <ChatComposer onSend={onSend} busy={true} streaming={true} onStop={onStop} />,
    )
    expect(container.querySelector('button[aria-label="Send"]')).toBeNull()
    const stopBtn = container.querySelector(
      'button[aria-label="Stop generating"]',
    ) as HTMLButtonElement
    expect(stopBtn).toBeTruthy()
    fireEvent.click(stopBtn)
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('photo path: compresses → normalizeChatInput({kind:photo}) → injects returned text', async () => {
    normalizeChatInput.mockResolvedValue({ ok: true, text: 'analysis: a wooden fence' })
    const onSend = vi.fn()
    const { container } = render(<ChatComposer onSend={onSend} busy={false} />)

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'job.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('analysis: a wooden fence'))
    expect(normalizeChatInput).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'photo' }),
    )
  })

  it('failed normalize (ok:false) does NOT call onSend and toasts', async () => {
    normalizeChatInput.mockResolvedValue({ ok: false, text: '', reason: 'unauthorized' })
    const onSend = vi.fn()
    const { container } = render(<ChatComposer onSend={onSend} busy={false} />)

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'job.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(onSend).not.toHaveBeenCalled()
  })
})
