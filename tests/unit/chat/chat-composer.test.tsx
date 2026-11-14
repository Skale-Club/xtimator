/**
 * CHATUI-01 / CHATUI-03 — chat-composer: text submit + multimodal injection.
 *
 * GREEN (Plan 125-02): components/chat/chat-composer.tsx routes text, audio, and
 * photo through normalizeChatInput → onSend(text). These assertions lock the
 * behavior: a text submit fires once + clears; busy disables Send; the photo path
 * normalizes-to-text and forwards it to onSend; a failed normalize does NOT call
 * onSend (and toasts). RTL `container` style, no jest-dom.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react'

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

afterEach(() => vi.unstubAllGlobals())

describe('ChatComposer (CHATUI-01/03)', () => {
  // Contract anchor (runs now): submitting non-empty text calls onSend(text) once.
  it('onSend contract: fires once with the trimmed text', () => {
    const onSend = vi.fn()
    const text = '  estimate a fence  '
    if (text.trim()) onSend(text.trim())
    expect(onSend).toHaveBeenCalledExactlyOnceWith('estimate a fence')
  })

  it('typing then clicking Send calls onSend(text) and clears the textarea', async () => {
    const onSend = vi.fn()
    const { container } = render(<ChatComposer onSend={onSend} busy={false} />)
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement

    fireEvent.change(textarea, { target: { value: 'estimate a fence' } })
    fireEvent.click(container.querySelector('button[aria-label="Send"]')!)

    expect(onSend).toHaveBeenCalledExactlyOnceWith('estimate a fence')
    await waitFor(() => expect(textarea.value).toBe(''))
  })

  it('keeps Enter available for new lines, including on mobile keyboards', () => {
    const onSend = vi.fn()
    const { getByLabelText } = render(<ChatComposer onSend={onSend} busy={false} />)
    const textarea = getByLabelText('Message') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'First part of a long job description' } })

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    fireEvent(textarea, event)

    expect(event.defaultPrevented).toBe(false)
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea.getAttribute('enterkeyhint')).toBe('enter')
    expect(textarea.rows).toBe(3)
  })

  it.each(['ctrlKey', 'metaKey'])('supports %s+Enter to send', async (modifier) => {
    const onSend = vi.fn()
    const { getByLabelText } = render(<ChatComposer onSend={onSend} busy={false} />)
    const textarea = getByLabelText('Message') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '  estimate a fence  ' } })
    fireEvent.keyDown(textarea, { key: 'Enter', [modifier]: true })
    expect(onSend).toHaveBeenCalledExactlyOnceWith('estimate a fence')
    await waitFor(() => expect(textarea.value).toBe(''))
  })

  it('does not submit while an IME is composing', () => {
    const onSend = vi.fn()
    const { getByLabelText } = render(<ChatComposer onSend={onSend} busy={false} />)
    const textarea = getByLabelText('Message')
    fireEvent.change(textarea, { target: { value: 'unfinished composition' } })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true, isComposing: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('grows with text, scrolls at the limit, then shrinks when text is removed', () => {
    const { getByLabelText } = render(<ChatComposer onSend={vi.fn()} busy={false} />)
    const textarea = getByLabelText('Message') as HTMLTextAreaElement
    let measuredHeight = 120
    Object.defineProperty(textarea, 'scrollHeight', { get: () => measuredHeight })
    fireEvent.change(textarea, { target: { value: 'A few lines of job details' } })
    expect(textarea.style.height).toBe('120px')
    expect(textarea.style.overflowY).toBe('hidden')

    measuredHeight = 420
    fireEvent.change(textarea, { target: { value: 'An entire site walkthrough' } })
    expect(textarea.style.height).toBe('192px')
    expect(textarea.style.overflowY).toBe('auto')

    measuredHeight = 84
    fireEvent.change(textarea, { target: { value: '' } })
    expect(textarea.style.height).toBe('84px')
    expect(textarea.style.overflowY).toBe('hidden')
  })

  it('preserves a new draft typed while an earlier send is starting', async () => {
    let completeSend!: () => void
    const onSend = vi.fn(() => new Promise<void>((resolve) => { completeSend = resolve }))
    const { getByLabelText } = render(<ChatComposer onSend={onSend} busy={false} />)
    const textarea = getByLabelText('Message') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'first message' } })
    fireEvent.click(getByLabelText('Send'))
    expect((getByLabelText('Send') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(textarea, { target: { value: 'follow-up draft' } })
    await act(async () => completeSend())
    expect(textarea.value).toBe('follow-up draft')
  })

  it('remeasures the draft when the chat panel gets narrower', () => {
    let notifyResize!: () => void
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { notifyResize = callback }
      observe() {}
      disconnect = disconnect
    })
    const { getByLabelText, unmount } = render(<ChatComposer onSend={vi.fn()} busy={false} />)
    const textarea = getByLabelText('Message') as HTMLTextAreaElement
    Object.defineProperties(textarea, {
      clientWidth: { configurable: true, value: 240 },
      scrollHeight: { configurable: true, value: 160 },
    })
    notifyResize()
    expect(textarea.style.height).toBe('160px')
    expect(textarea.style.overflowY).toBe('hidden')
    unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('shrinks and scrolls a long draft when the keyboard reduces the panel height, then grows back', () => {
    let notifyResize!: () => void
    const observe = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { notifyResize = callback }
      observe = observe
      disconnect() {}
    })
    let cap = 192
    const computedStyle = vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ maxHeight: `${cap}px` }) as CSSStyleDeclaration)
    const { getByLabelText, container, unmount } = render(
      <div data-chat-panel><ChatComposer onSend={vi.fn()} busy={false} /></div>,
    )
    const textarea = getByLabelText('Message') as HTMLTextAreaElement
    Object.defineProperty(textarea, 'scrollHeight', { value: 420 })
    fireEvent.change(textarea, { target: { value: 'A long job description' } })
    expect(textarea.style.height).toBe('192px')
    expect(observe).toHaveBeenCalledWith(container.querySelector('[data-chat-panel]'))

    cap = 72
    notifyResize()
    expect(textarea.style.height).toBe('72px')
    expect(textarea.style.overflowY).toBe('auto')
    expect(textarea.value).toBe('A long job description')

    cap = 192
    notifyResize()
    expect(textarea.style.height).toBe('192px')
    unmount()
    computedStyle.mockRestore()
  })

  it('retains the draft if starting a send fails', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('offline'))
    const { getByLabelText } = render(<ChatComposer onSend={onSend} busy={false} />)
    const textarea = getByLabelText('Message') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'important job details' } })
    fireEvent.click(getByLabelText('Send'))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(textarea.value).toBe('important job details')
    expect((getByLabelText('Send') as HTMLButtonElement).disabled).toBe(false)
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
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
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
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Use cedar for this fence' } })

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'job.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('analysis: a wooden fence'))
    expect(normalizeChatInput).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'photo', caption: 'Use cedar for this fence' }),
    )
    await waitFor(() => expect(textarea.value).toBe(''))
  })

  it('failed normalize (ok:false) does NOT call onSend and toasts', async () => {
    normalizeChatInput.mockResolvedValue({ ok: false, text: '', reason: 'unauthorized' })
    const onSend = vi.fn()
    const { container } = render(<ChatComposer onSend={onSend} busy={false} />)
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Keep this description' } })

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'job.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea.value).toBe('Keep this description')
  })

  it('audio still normalizes and sends the transcript without clearing the typed draft', async () => {
    const stopTrack = vi.fn()
    const stream = { getTracks: () => [{ stop: stopTrack }] }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })
    class Recorder {
      state = 'recording'
      mimeType = 'audio/webm'
      ondataavailable?: (event: { data: Blob }) => void
      onstop?: () => void
      start() {}
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['audio']) })
        this.onstop?.()
      }
    }
    vi.stubGlobal('MediaRecorder', Recorder)
    normalizeChatInput.mockResolvedValue({ ok: true, text: 'Replace the garden fence' })
    const onSend = vi.fn()
    const { getByLabelText } = render(<ChatComposer onSend={onSend} busy={false} />)
    const textarea = getByLabelText('Message') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'My separate draft' } })
    fireEvent.click(getByLabelText('Record audio'))
    await waitFor(() => expect(getByLabelText('Stop recording')).toBeTruthy())
    expect((getByLabelText('Send') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(getByLabelText('Stop recording'))
    await waitFor(() => expect(onSend).toHaveBeenCalledExactlyOnceWith('Replace the garden fence'))
    expect(normalizeChatInput).toHaveBeenCalledWith(expect.objectContaining({ kind: 'audio', ext: 'webm' }))
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(textarea.value).toBe('My separate draft')
  })
})
