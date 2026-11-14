'use client'

/**
 * components/chat/chat-composer.tsx — the multimodal chat input (CHATUI-03).
 *
 * Three input modalities, all funneled to a single text message upstream:
 *   - Text: type + submit (Send or Ctrl/Cmd+Enter) → onSend(text).
 *   - Audio: a Mic button starts MediaRecorder INSIDE the click handler (iOS
 *     Safari requires the user gesture — Pitfall 7); on stop the blob is base64'd
 *     and sent to the normalizeChatInput({kind:'audio'}) server action, whose
 *     returned transcript text is forwarded to onSend.
 *   - Photo: a paperclip button opens a file input; the picked file is compressed
 *     (compressImage), base64'd, and sent to normalizeChatInput({kind:'photo'})
 *     with the current text as the caption; the returned analysis text → onSend.
 *
 * Pitfall 4: we NEVER send raw audio/photo files to the model. The multimodal
 * input is always normalized to TEXT first, then becomes a normal sendMessage.
 * All domain logic lives in the neutral normalizeInput behind the server action —
 * the composer reimplements none of it.
 */
import { useLayoutEffect, useRef, useState } from 'react'
import { Mic, Square, Paperclip, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useWakeLock } from '@/hooks/use-wake-lock'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getSupportedAudioMimeType, getFileExtension } from '@/lib/utils/media-format'
import { compressImage } from '@/lib/utils/image-compressor'
import { normalizeChatInput } from '@/lib/actions/chat'

/** Read a Blob as base64 (without the data: prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.readAsDataURL(blob)
  })
}

function resizeTextarea(textarea: HTMLTextAreaElement) {
  const computedMax = Number.parseFloat(window.getComputedStyle(textarea).maxHeight)
  let maxHeight = Number.isFinite(computedMax) ? computedMax : 192
  if (!Number.isFinite(computedMax)) {
    // Some engines return the CSS min()/max() expression instead of pixels.
    // Measure its actual constraint; jsdom has no layout and uses the fallback.
    textarea.style.height = '192px'
    maxHeight = textarea.getBoundingClientRect().height || 192
  }
  textarea.style.height = 'auto'
  const contentHeight = textarea.scrollHeight
  textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`
  textarea.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden'
}

export function ChatComposer({
  onSend,
  busy,
  streaming = false,
  onStop,
}: {
  onSend: (text: string) => void | Promise<void>
  busy: boolean
  /** The assistant is mid-stream — the send slot becomes a Stop button. */
  streaming?: boolean
  onStop?: () => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [normalizing, setNormalizing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [sending, setSending] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const photoInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Resize in both directions, then keep long walkthroughs inside the input.
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    resizeTextarea(textarea)
  }, [text])

  // Watch the panel too: a keyboard can change the height cap without changing
  // the width. Ignore our own height updates to avoid an observer feedback loop.
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    let width = textarea.clientWidth
    let maxHeight = window.getComputedStyle(textarea).maxHeight
    function remeasure() {
      if (!textarea) return
      const nextMaxHeight = window.getComputedStyle(textarea).maxHeight
      if (textarea.clientWidth === width && nextMaxHeight === maxHeight) return
      width = textarea.clientWidth
      maxHeight = nextMaxHeight
      resizeTextarea(textarea)
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure)
    observer?.observe(textarea)
    const panel = textarea.closest('[data-chat-panel]')
    if (panel) observer?.observe(panel)
    window.addEventListener('resize', remeasure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', remeasure)
    }
  }, [])

  // Hold the screen on while dictating and while the audio/photo is being
  // normalized server-side — the phone is untouched for both.
  useWakeLock(recording || normalizing)

  // Gates SUBMIT + media buttons while the parent thread is streaming or while
  // we normalize media. The textarea itself only locks during normalization
  // (its result overwrites the draft) — typing stays open mid-stream.
  const disabled = busy || normalizing || sending

  async function submitText() {
    const value = text.trim()
    if (!value || disabled || recording) return
    const submittedDraft = text
    setSending(true)
    try {
      await onSend(value)
      // A new draft typed while the conversation is being created is retained.
      setText((current) => current === submittedDraft ? '' : current)
    } catch {
      toast.error(t('Could not send the message. Please try again.'))
    } finally {
      setSending(false)
    }
  }

  // ── Audio ────────────────────────────────────────────────────────────────
  // Start MUST happen inside this click handler (iOS Safari gesture — Pitfall 7).
  async function startRecording() {
    if (disabled || recording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const mimeType = getSupportedAudioMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const mime = recorder.mimeType || mimeType
        const blob = new Blob(chunksRef.current, { type: mime })
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        void handleAudioBlob(blob, mime)
      }

      recorder.start()
      setRecording(true)
    } catch {
      toast.error(t('Could not access the microphone.'))
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    setRecording(false)
  }

  async function handleAudioBlob(blob: Blob, mime: string) {
    setNormalizing(true)
    try {
      const base64 = await blobToBase64(blob)
      const result = await normalizeChatInput({
        kind: 'audio',
        base64,
        ext: getFileExtension(mime),
      })
      if (result.ok && result.text.trim()) {
        await onSend(result.text)
      } else {
        toast.error(t('Could not transcribe the audio. Please try again.'))
      }
    } catch {
      toast.error(t('Could not transcribe the audio. Please try again.'))
    } finally {
      setNormalizing(false)
    }
  }

  // ── Photo ────────────────────────────────────────────────────────────────
  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (photoInputRef.current) photoInputRef.current.value = ''
    if (!file || disabled) return

    setNormalizing(true)
    try {
      let blob: Blob
      try {
        blob = await compressImage(file, 2000, 0.85)
      } catch {
        blob = file
      }
      const base64 = await blobToBase64(blob)
      const caption = text.trim() || undefined
      const result = await normalizeChatInput({
        kind: 'photo',
        base64,
        mimeType: 'image/jpeg',
        caption,
      })
      if (result.ok && result.text.trim()) {
        await onSend(result.text)
        setText('')
      } else {
        toast.error(t('Could not analyze the photo. Please try again.'))
      }
    } catch {
      toast.error(t('Could not analyze the photo. Please try again.'))
    } finally {
      setNormalizing(false)
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-background px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
      <div className="@container min-w-0 rounded-2xl border border-border bg-card shadow-sm transition-shadow focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoPick}
        />

        <Textarea
          ref={textareaRef}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submitText()
            }
          }}
          enterKeyHint="enter"
          placeholder={t('Describe the job or ask a question…')}
          // Keep drafts editable while a response streams or a send is starting.
          disabled={normalizing}
          aria-label={t('Message')}
          className="[--chat-composer-max-height:min(12rem,max(3.5rem,calc(var(--chat-panel-height,100dvh)_-_14rem)))] max-h-[var(--chat-composer-max-height)] min-h-[min(5.25rem,var(--chat-composer-max-height))] w-full min-w-0 resize-none rounded-none border-0 bg-transparent px-3 py-3 text-base leading-5 shadow-none field-sizing-fixed [overflow-wrap:anywhere] focus-visible:shadow-none sm:text-sm"
        />

        <div className="flex min-w-0 items-center justify-between gap-2 px-2 pb-2">
          <div className="flex min-w-0 items-center gap-1">
            <Button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={disabled || recording}
              size="icon"
              variant="ghost"
              aria-label={t('Attach a photo')}
              className="h-11 w-11 shrink-0 rounded-xl text-muted-foreground"
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              onClick={() => (recording ? stopRecording() : void startRecording())}
              disabled={disabled && !recording}
              size="icon"
              variant={recording ? 'destructive' : 'ghost'}
              aria-label={recording ? t('Stop recording') : t('Record audio')}
              className="h-11 w-11 shrink-0 rounded-xl"
            >
              {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <span role="status" className="truncate text-xs text-muted-foreground">
              {recording ? t('Recording…') : normalizing ? t('Processing…') : ''}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-muted-foreground @min-[360px]:inline">
              {t('Ctrl/⌘ + Enter to send')}
            </span>

            {streaming && onStop ? (
              <Button
                type="button"
                onClick={onStop}
                size="icon"
                variant="outline"
                aria-label={t('Stop generating')}
                className="h-11 w-11 rounded-xl"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void submitText()}
                disabled={disabled || recording || text.trim().length === 0}
                size="icon"
                aria-label={t('Send')}
                className="h-11 w-11 rounded-xl"
              >
                {normalizing || sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
