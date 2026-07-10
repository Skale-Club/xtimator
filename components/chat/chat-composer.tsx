'use client'

/**
 * components/chat/chat-composer.tsx — the multimodal chat input (CHATUI-03).
 *
 * Three input modalities, all funneled to a single text message upstream:
 *   - Text: type + submit (Enter w/o shift, or the Send button) → onSend(text).
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
import { useRef, useState } from 'react'
import { Mic, Square, Paperclip, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/use-translation'
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

export function ChatComposer({
  onSend,
  busy,
  streaming = false,
  onStop,
}: {
  onSend: (text: string) => void
  busy: boolean
  /** The assistant is mid-stream — the send slot becomes a Stop button. */
  streaming?: boolean
  onStop?: () => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [normalizing, setNormalizing] = useState(false)
  const [recording, setRecording] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Gates SUBMIT + media buttons while the parent thread is streaming or while
  // we normalize media. The textarea itself only locks during normalization
  // (its result overwrites the draft) — typing stays open mid-stream.
  const disabled = busy || normalizing

  function submitText() {
    const value = text.trim()
    if (!value || disabled) return
    setText('')
    onSend(value)
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
        onSend(result.text)
      } else {
        toast.error(t('Could not transcribe the audio. Please try again.'))
      }
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
        setText('')
        onSend(result.text)
      } else {
        toast.error(t('Could not analyze the photo. Please try again.'))
      }
    } finally {
      setNormalizing(false)
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-border p-3">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoPick}
      />

      <Button
        type="button"
        onClick={() => photoInputRef.current?.click()}
        disabled={disabled || recording}
        size="icon"
        variant="ghost"
        aria-label={t('Attach a photo')}
      >
        <Paperclip className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        onClick={() => (recording ? stopRecording() : void startRecording())}
        disabled={disabled}
        size="icon"
        variant={recording ? 'destructive' : 'ghost'}
        aria-label={recording ? t('Stop recording') : t('Record audio')}
      >
        {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>

      <Textarea
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submitText()
          }
        }}
        placeholder={t('Type a message…')}
        // Typing stays open while the assistant streams (only submit is gated) —
        // media normalization still locks the field (its result overwrites text).
        disabled={normalizing}
        aria-label={t('Message')}
        className="max-h-32 min-h-[40px] flex-1 resize-none"
      />

      {streaming && onStop ? (
        <Button
          type="button"
          onClick={onStop}
          size="icon"
          variant="outline"
          aria-label={t('Stop generating')}
        >
          <Square className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          type="button"
          onClick={submitText}
          disabled={disabled || text.trim().length === 0}
          size="icon"
          aria-label={t('Send')}
        >
          {normalizing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  )
}
