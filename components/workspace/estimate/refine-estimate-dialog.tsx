'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Sparkles,
  Mic,
  Camera,
  X,
  Loader2,
  Send,
  Image as ImageIcon,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { getSupportedAudioMimeType } from '@/lib/utils/media-format'
import { VoiceRecorder } from '@/components/workspace/audio/voice-recorder'
import type { RefinementPayload } from './use-estimate-reducer'

interface RefineEstimateDialogProps {
  estimateId: string
  version: number
  onApply: (refined: RefinementPayload) => void
}

const MAX_AUDIO_MS = 120_000 // 2 minutes
const MAX_PHOTOS = 5

type RecState = 'idle' | 'recording'
type SubmitState = 'idle' | 'submitting'

export function RefineEstimateDialog({
  estimateId,
  version,
  onApply,
}: RefineEstimateDialogProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [recState, setRecState] = useState<RecState>('idle')
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [submitState, setSubmitState] = useState<SubmitState>('idle')

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef<string>('')
  const audioCtxRef = useRef<AudioContext | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<number>(0)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const teardownStream = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    setAnalyser(null)
  }, [])

  // Reset everything when the dialog closes.
  useEffect(() => {
    if (open) return
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop()
      } catch {}
    }
    teardownStream()
    setText('')
    setAudioBlob(null)
    setPhotos([])
    setElapsedMs(0)
    setRecState('idle')
    setSubmitState('idle')
  }, [open, teardownStream])

  const startRecording = useCallback(async () => {
    chunksRef.current = []
    setElapsedMs(0)
    setAudioBlob(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const ctx = new AudioContext()
      if (ctx.state === 'suspended') await ctx.resume()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const node = ctx.createAnalyser()
      node.fftSize = 256
      source.connect(node)
      setAnalyser(node)

      const mime = getSupportedAudioMimeType()
      mimeRef.current = mime
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeRef.current,
        })
        setAudioBlob(blob)
        teardownStream()
        setRecState('idle')
      }

      recorder.start()
      startedAtRef.current = performance.now()
      setRecState('recording')

      tickRef.current = setInterval(() => {
        const elapsed = performance.now() - startedAtRef.current
        setElapsedMs(elapsed)
        if (elapsed >= MAX_AUDIO_MS) {
          if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop()
          }
        }
      }, 100)
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string }
      if (e?.name === 'NotAllowedError') {
        toast.error('Microphone permission denied.')
      } else if (e?.name === 'NotFoundError') {
        toast.error('No microphone found.')
      } else {
        toast.error(e?.message ?? 'Failed to start recording.')
      }
    }
  }, [teardownStream])

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }, [])

  const handlePhotoSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return
      const incoming = Array.from(files).filter((f) => f.type.startsWith('image/'))
      setPhotos((prev) => {
        const combined = [...prev, ...incoming]
        if (combined.length > MAX_PHOTOS) {
          toast.error(`Maximum ${MAX_PHOTOS} photos per refinement`)
        }
        return combined.slice(0, MAX_PHOTOS)
      })
      if (photoInputRef.current) photoInputRef.current.value = ''
    },
    []
  )

  const removePhoto = useCallback((idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const submit = useCallback(async () => {
    const hasInput = text.trim() || audioBlob || photos.length > 0
    if (!hasInput) {
      toast.error('Add an instruction, recording, or photo first.')
      return
    }

    setSubmitState('submitting')
    try {
      const form = new FormData()
      if (text.trim()) form.append('instruction', text.trim())
      if (audioBlob) form.append('audio', audioBlob, 'voice-refine.webm')
      for (const p of photos) form.append('photos', p)

      const res = await fetch(`/api/estimates/${estimateId}/refine`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error ?? 'Refinement failed')
      }
      onApply(data.refined as RefinementPayload)
      toast.success('Changes applied | review and save your draft.')
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Refinement failed')
    } finally {
      setSubmitState('idle')
    }
  }, [audioBlob, photos, text, estimateId, onApply])

  const elapsedSeconds = Math.floor(elapsedMs / 1000)
  const maxSeconds = Math.floor(MAX_AUDIO_MS / 1000)
  const isSubmitting = submitState === 'submitting'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="rounded-full gap-1.5 text-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Refine with AI
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Refine v{version} draft
          </DialogTitle>
          <DialogDescription>
            Tell the AI what to change. Use text, voice, or photos | your
            updates apply to the current draft and you decide when to save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Add gutter cleaning, about 80 linear feet. Remove the carpet shampoo line."
            rows={5}
            disabled={isSubmitting}
            className="resize-y"
          />

          {/* Voice */}
          <Card variant="glass" className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Mic className="h-4 w-4" /> Voice note
              <span className="text-xs text-muted-foreground font-normal ml-auto">
                up to {maxSeconds}s
              </span>
            </div>
            <VoiceRecorder
              size="sm"
              analyser={analyser}
              isRecording={recState === 'recording'}
              elapsedMs={elapsedMs}
              onToggle={recState === 'recording' ? stopRecording : startRecording}
              disabled={isSubmitting}
              maxMs={MAX_AUDIO_MS}
            />
            {audioBlob && recState === 'idle' && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">
                  Voice note ready · {elapsedSeconds}s
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAudioBlob(null)
                    setElapsedMs(0)
                  }}
                  className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  disabled={isSubmitting}
                >
                  Remove
                </button>
              </div>
            )}
          </Card>

          {/* Photos */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Camera className="h-4 w-4" /> Photos
              <span className="text-xs text-muted-foreground font-normal ml-auto">
                up to {MAX_PHOTOS}
              </span>
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-square rounded-md border border-border bg-background overflow-hidden"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(p)}
                      alt={p.name}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      disabled={isSubmitting}
                      className="absolute top-1 right-1 rounded-full bg-background/90 p-1 text-foreground shadow hover:bg-background"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoSelect}
              disabled={isSubmitting || photos.length >= MAX_PHOTOS}
              className="hidden"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => photoInputRef.current?.click()}
              disabled={isSubmitting || photos.length >= MAX_PHOTOS}
              className="gap-1.5"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              {photos.length === 0 ? 'Add photos' : 'Add more'}
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={isSubmitting} className="gap-1.5">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Apply changes
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
