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
  ArrowRight,
  Plus,
  Minus,
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
import { useWakeLock } from '@/hooks/use-wake-lock'
import type { RefinementPayload } from './use-estimate-reducer'
import { mergeRefinement, type MergeCurrentContent, type RefineDiff } from '@/lib/estimate/refine-merge'
import { formatCurrency } from '@/lib/utils/format'

interface RefineEstimateDialogProps {
  estimateId: string
  version: number
  /** REFINE-01 (audit G1): true when the editor has unsaved edits. Gates the
   *  pre-POST flush below -- a clean editor has nothing to lose, so no flush
   *  is needed. */
  isDirty: boolean
  /** REFINE-01: flushes a save BEFORE the refine POST so the server (which
   *  reads the PERSISTED estimate) refines what the user is actually looking
   *  at. Returns runSave's boolean -- false on lock/conflict/error, in which
   *  case the dialog must NOT proceed to the POST (the refine would run on
   *  stale data and silently discard the user's edit). runSave itself
   *  surfaces the failure toast; the dialog only needs to abort. */
  onBeforeRefine: () => Promise<boolean>
  /** REFINE-02: the LIVE current editor content (sections + summary/notes/
   *  terms), read at compute time via a ref (NOT a dialog-open snapshot) so
   *  the diff reflects the post-flush + id-remapped state. */
  currentContent: MergeCurrentContent
  currencyCode: string
  onApply: (refined: RefinementPayload) => void
}

const MAX_AUDIO_MS = 120_000 // 2 minutes
const MAX_PHOTOS = 5

type RecState = 'idle' | 'recording'
type SubmitState = 'idle' | 'submitting'

export function RefineEstimateDialog({
  estimateId,
  version,
  isDirty,
  onBeforeRefine,
  currentContent,
  currencyCode,
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
  // REFINE-02: post-POST review state -- Apply/Discard decide from here, the
  // dialog never auto-applies. Holding both the raw refined payload (what
  // Apply dispatches) and the precomputed diff (what the user reviews).
  const [pendingReview, setPendingReview] = useState<{ refined: RefinementPayload; diff: RefineDiff } | null>(null)

  // Hold the screen on while dictating a refinement and while the refine
  // request runs — both are untouched-phone windows.
  useWakeLock(recState === 'recording' || submitState === 'submitting')

  // REFINE-02: currentContent must be read LIVE at compute time (after the
  // flush resolves), never a value captured when `submit` started -- a ref
  // updated every render (same idiom as estimate-editor.tsx's stateRef)
  // guarantees `submit`'s async body sees the post-flush content even though
  // its own closure was created before the flush ran.
  const currentContentRef = useRef(currentContent)
  currentContentRef.current = currentContent

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
    setPendingReview(null)
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
      // REFINE-01 (audit G1): flush unsaved edits BEFORE the refine POST --
      // the route reads the PERSISTED estimate (getEstimateById), so a dirty
      // editor would otherwise get refined against stale data AND have its
      // local edit silently discarded once the merge lands. onBeforeRefine
      // returns runSave's boolean; a lock/conflict/error means the flush did
      // NOT persist -- abort before the POST (runSave already surfaced the
      // failure toast; nothing more to say here).
      if (isDirty) {
        const flushed = await onBeforeRefine()
        if (!flushed) {
          setSubmitState('idle')
          return
        }
      }

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
      const refined = data.refined as RefinementPayload
      // REFINE-02: compute the review diff against the LIVE post-flush
      // content (currentContentRef, not a value snapshotted at dialog-open)
      // -- the SAME pure util the reducer's APPLY_REFINEMENT re-runs on
      // Apply, so what's reviewed here is exactly what lands.
      const { diff } = mergeRefinement(currentContentRef.current, refined)
      setPendingReview({ refined, diff })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Refinement failed')
    } finally {
      setSubmitState('idle')
    }
  }, [audioBlob, photos, text, estimateId, isDirty, onBeforeRefine])

  const handleApply = useCallback(() => {
    if (!pendingReview) return
    onApply(pendingReview.refined)
    toast.success('Changes applied | review and save your draft.')
    setOpen(false)
  }, [pendingReview, onApply])

  const handleDiscardReview = useCallback(() => {
    setOpen(false)
  }, [])

  const elapsedSeconds = Math.floor(elapsedMs / 1000)
  const maxSeconds = Math.floor(MAX_AUDIO_MS / 1000)
  const isSubmitting = submitState === 'submitting'

  const diff = pendingReview?.diff
  const hasFieldChanges = !!(
    diff?.fields.summary ||
    diff?.fields.notes ||
    diff?.fields.timeline ||
    diff?.fields.payment_terms ||
    diff?.fields.warranty_terms
  )
  const hasAnyChanges =
    !!diff && (diff.changed.length > 0 || diff.added.length > 0 || diff.removed.length > 0 || hasFieldChanges)

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
            {pendingReview
              ? 'Review the AI’s changes below, then Apply or Discard.'
              : 'Tell the AI what to change. Use text, voice, or photos | your updates apply to the current draft and you decide when to save.'}
          </DialogDescription>
        </DialogHeader>

        {pendingReview && diff ? (
          // -------------------------------------------------------------
          // REFINE-02: review-before-apply. The dialog never dispatches
          // APPLY_REFINEMENT on its own -- only Apply does, and Discard is a
          // true no-op (close only).
          // -------------------------------------------------------------
          <div className="space-y-4" data-testid="refine-review">
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 max-h-[50vh] overflow-y-auto">
              {!hasAnyChanges && (
                <p className="text-sm text-muted-foreground">No changes detected.</p>
              )}

              {diff.fields.summary && (
                <div className="space-y-1" data-testid="refine-diff-summary">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Summary
                  </p>
                  <p className="text-sm text-muted-foreground line-through">{diff.fields.summary.old}</p>
                  <p className="text-sm text-foreground">{diff.fields.summary.new}</p>
                </div>
              )}

              {(diff.fields.notes || diff.fields.timeline || diff.fields.payment_terms || diff.fields.warranty_terms) && (
                <p className="text-sm text-muted-foreground" data-testid="refine-diff-fields">
                  Also updated:{' '}
                  {[
                    diff.fields.notes && 'notes',
                    diff.fields.timeline && 'timeline',
                    diff.fields.payment_terms && 'payment terms',
                    diff.fields.warranty_terms && 'warranty terms',
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              )}

              {diff.changed.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <ArrowRight className="h-3 w-3" /> Changed ({diff.changed.length})
                  </p>
                  {diff.changed.map((c, i) => (
                    <div
                      key={i}
                      data-testid="refine-diff-changed"
                      className="text-sm flex items-center justify-between gap-2 rounded-md bg-background px-2.5 py-1.5"
                    >
                      <span className="truncate">{c.description}</span>
                      {c.oldPrice !== c.newPrice && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatCurrency(c.oldPrice, currencyCode)}
                          {' → '}
                          {formatCurrency(c.newPrice, currencyCode)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {diff.added.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-600 flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Added ({diff.added.length})
                  </p>
                  {diff.added.map((a, i) => (
                    <div
                      key={i}
                      data-testid="refine-diff-added"
                      className="text-sm flex items-center justify-between gap-2 rounded-md bg-background px-2.5 py-1.5"
                    >
                      <span className="truncate">{a.description}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatCurrency(a.unit_price, currencyCode)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {diff.removed.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-destructive flex items-center gap-1">
                    <Minus className="h-3 w-3" /> Removed ({diff.removed.length})
                  </p>
                  {diff.removed.map((r, i) => (
                    <div
                      key={i}
                      data-testid="refine-diff-removed"
                      className="text-sm rounded-md bg-background px-2.5 py-1.5 truncate"
                    >
                      {r.description}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={handleDiscardReview} data-testid="refine-discard-btn">
                Discard
              </Button>
              <Button onClick={handleApply} className="gap-1.5" data-testid="refine-apply-btn">
                <Send className="h-3.5 w-3.5" />
                Apply changes
              </Button>
            </div>
          </div>
        ) : (
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
            <Button onClick={submit} disabled={isSubmitting} className="gap-1.5" data-testid="refine-submit-btn">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Reviewing...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Preview changes
                </>
              )}
            </Button>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
