'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CaptureTimer } from '@/components/capture/capture-timer'
import { CaptureStepper } from '@/components/capture/capture-stepper'
import { CaptureProcessingOverlay } from '@/components/capture/capture-processing-overlay'
import { CaptureFailure } from '@/components/capture/capture-failure'
import { VoiceRecorder } from '@/components/workspace/audio/voice-recorder'
import { createRecording, transcribeRecording, createTextRecording } from '@/lib/actions/recording'
import { createBlankEstimate } from '@/lib/actions/estimate'
import { createPhoto, deletePhoto } from '@/lib/actions/photo'
import { createClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'
import { getSupportedAudioMimeType, getFileExtension } from '@/lib/utils/media-format'
import { compressImage } from '@/lib/utils/image-compressor'
import { Camera, Sparkles } from 'lucide-react'
import { LoadingDots } from '@/components/ui/loading-dots'
import type { ProjectDetail } from '@/lib/queries/project'
import type { Photo } from '@/lib/queries/photo'
import { pollJob, type JobResult } from '@/hooks/use-job-status'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useLanguage } from '@/lib/i18n/language-context'
import { EstimateLanguageSelector } from '@/components/estimate/estimate-language-selector'
import { type EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { CaptureMode } from '@/components/projects/estimate-creation-popup'

// Duration constants — D-06, D-07
export const HARD_CAP_MS  = 10 * 60 * 1000   // 600000  D-06 — auto-stop
export const WARN_AT_MS   =  9 * 60 * 1000   // 540000  D-07 — 60s remaining
export const AMBER_AT_MS  =  8 * 60 * 1000   // 480000  D-07 — neutral→amber
export const RED_AT_MS    =  9.5 * 60 * 1000 // 570000  D-07 — amber→red
const TICK_MS = 250                            // RESEARCH Pattern 4

// Hard cap on photos attachable to a single capture (popup New Xtimate flow).
const MAX_PHOTOS = 16

// Pure cap math: given how many photos are already present and how many are
// incoming, return how many to take and whether the incoming set overflowed.
export function clampToPhotoLimit(
  currentCount: number,
  incoming: number
): { take: number; overflowed: boolean } {
  const remaining = Math.max(0, MAX_PHOTOS - currentCount)
  const take = Math.min(remaining, incoming)
  return { take, overflowed: incoming > remaining }
}

type SpeechRecognitionInstance = {
  start: () => void
  stop: () => void
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((event: unknown) => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

type PhotoItemStatus = 'uploading' | 'done' | 'error'
interface PhotoItem {
  id: string                 // client-minted photoId (storage filename source pre-success)
  status: PhotoItemStatus
  previewUrl: string         // object URL for instant thumbnail
  photo?: Photo              // present once status === 'done'
}

type Stage = 'idle' | 'saving' | 'transcribing' | 'analyzing' | 'generating' | 'done'
type StageKey = 'saving' | 'transcribing' | 'analyzing' | 'generating'

interface CaptureRecorderProps {
  project: ProjectDetail
  companyId: string
  projectId: string
  /**
   * Visual mode. `fullscreen` (default) preserves the legacy `/capture` route
   * behavior — the recorder takes the whole viewport via the (capture) layout.
   * `popup` strips the redundant inner header and lets the parent Dialog
   * control chrome, completion, and cancel.
   */
  variant?: 'fullscreen' | 'popup'
  /**
   * Single-modality lock for the popup flow. When set, RecorderBody renders
   * ONLY the matching input (audio | text | photos). When undefined (legacy
   * fullscreen /capture route), the original all-three-inputs-with-OR layout
   * renders unchanged for backward compatibility.
   */
  mode?: CaptureMode
  /**
   * If supplied, the pipeline calls this on successful completion instead of
   * hard-navigating to `?tab=estimate&estimate=…`. The parent decides where
   * to send the user next (typically close the dialog + push `/projects/[id]`).
   */
  onComplete?: (estimateId: string) => void
  /**
   * If supplied, the failure-path "Continue manually" button calls this
   * instead of navigating away. The parent dismisses the dialog.
   */
  onCancel?: () => void
  /**
   * Optional controlled estimate-language state. When provided (e.g. the popup
   * lifts it into the Dialog header), the recorder uses these instead of its own
   * internal state. When omitted, it manages the language internally.
   */
  estimateLanguage?: EstimateLanguage
  setEstimateLanguage?: (lang: EstimateLanguage) => void
}

export function CaptureRecorder({
  project,
  companyId,
  projectId,
  variant = 'fullscreen',
  mode,
  onComplete,
  // onCancel is part of the public prop signature so callers (e.g. estimate-creation-popup)
  // can keep passing handleCancel. After the 260525-wdj fix, "Edit manually" always pushes
  // to /projects/{projectId} via router.push, so the recorder itself never calls onCancel —
  // the popup chrome (Dialog onOpenChange) owns the X/overlay close path.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onCancel,
  estimateLanguage: estimateLanguageProp,
  setEstimateLanguage: setEstimateLanguageProp,
}: CaptureRecorderProps) {
  const { t } = useTranslation()
  const { language: appLanguage } = useLanguage()
  const router = useRouter()

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  // Pipeline state
  const [stage, setStage] = useState<Stage>('idle')
  const [failedAt, setFailedAt] = useState<StageKey | undefined>(undefined)
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
  const [transcript, setTranscript] = useState<string | undefined>(undefined)
  const [retriesUsed, setRetriesUsed] = useState(0)

  // Multi-modal input state
  const [descriptionText, setDescriptionText] = useState('')
  const [uploadedPhotos, setUploadedPhotos] = useState<Photo[]>([])
  // Per-photo items (uploading | done | error) drive the thumbnail strip.
  // `uploadedPhotos` stays the pipeline source of truth (only 'done' photos).
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([])
  const isUploadingPhotos = photoItems.some(i => i.status === 'uploading')

  // Live transcript state (Web Speech API preview — horizontal layout only)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')

  // Language for the estimate — default from app language (cascade layer 4).
  // Controlled by the parent when props are supplied (popup lifts it into the
  // Dialog header); otherwise managed internally (fullscreen /capture route).
  const [internalEstimateLanguage, setInternalEstimateLanguage] = useState<EstimateLanguage>(
    appLanguage === 'pt' || appLanguage === 'es' ? appLanguage : 'en'
  )
  const estimateLanguage = estimateLanguageProp ?? internalEstimateLanguage
  const setEstimateLanguage = setEstimateLanguageProp ?? setInternalEstimateLanguage

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef<string>('')
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const warnedRef = useRef<boolean>(false)
  const abortControllerRef = useRef<AbortController>(new AbortController())
  const photoInputRef = useRef<HTMLInputElement>(null)
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  // Mirror photoItems into a ref so the unmount cleanup + remove handler read
  // the latest items without re-subscribing / re-creating callbacks.
  const photoItemsRef = useRef<PhotoItem[]>([])
  useEffect(() => { photoItemsRef.current = photoItems }, [photoItems])

  // REC-03/REC-04 attempt lineage. attemptId/requestId are minted ONCE on the
  // first Generate and reused on Retry (NOT reset) so the generate-estimate
  // event id (estimate-${projectId}-${requestId}) is stable → Inngest dedups a
  // re-dispatch and an already-completed step is not re-charged. recordingIdRef
  // holds the recording row id so a Retry reuses the same transcribe event id
  // (transcribe-${recordingId}) instead of re-uploading + re-transcribing.
  const attemptIdRef = useRef<string | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const recordingIdRef = useRef<string | null>(null)

  // Mint the attempt + request lineage once; subsequent calls (Retry) are no-ops.
  const ensureAttempt = useCallback(() => {
    if (!attemptIdRef.current) attemptIdRef.current = crypto.randomUUID()
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID()
  }, [])

  // Build the friendly, i18n failure reason for a non-completed pollJob result.
  // Inline t() ternaries so the extractor picks up the keys (Pitfall 5).
  const reasonForJobState = useCallback(
    (
      result: JobResult,
      kind: 'transcription' | 'generation'
    ): string =>
      result.state === 'config_unavailable'
        ? t('Processing service is temporarily unavailable — your recording is saved. You can edit manually.')
        : result.state === 'not_found'
          ? t('We could not find this job — please retry.')
          : kind === 'transcription'
            ? t('Transcription failed.')
            : t('Estimate generation failed.'),
    [t]
  )

  // Stop recording (memoized for use in callbacks)
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current)
      tickIntervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    speechRecognitionRef.current?.stop()
    setAnalyser(null)
    setIsRecording(false)
    setInterimTranscript('')
    // Flip stage synchronously so React never paints an interim frame with
    // stage='idle' && isRecording=false (which would re-show the recorder UI).
    // runPipeline() will also call setStage('saving') from the async onstop
    // handler — that's idempotent. The functional guard preserves the current
    // stage if a retry / fullscreen path has already advanced past 'idle'.
    setStage((s) => s === 'idle' ? 'saving' : s)
  }, [])

  // Tick — wall-clock elapsed (RESEARCH Pattern 4)
  const tick = useCallback(() => {
    const elapsed = performance.now() - startTimeRef.current
    setElapsedMs(elapsed)
    if (elapsed >= WARN_AT_MS && !warnedRef.current) {
      warnedRef.current = true
      toast.warning(t('60 seconds remaining'), {
        description: t('Recording will auto-stop at 10 minutes.'),
      })
    }
    if (elapsed >= HARD_CAP_MS) {
      toast.info(t('Time limit reached'), { description: t('Recording stopped at 10 minutes.') })
      stopRecording()
    }
  }, [stopRecording])

  // Visibility change safety — fire tick immediately when tab becomes visible (RESEARCH Pattern 4)
  useEffect(() => {
    const onVis = () => { if (!document.hidden && isRecording) tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [tick, isRecording])

  // Prevent accidental navigation while recording (Pitfall 3)
  useEffect(() => {
    if (!isRecording) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isRecording])

  // Track mute/inactive events — permission revoked mid-recording (Pitfall 2)
  useEffect(() => {
    const stream = streamRef.current
    if (!isRecording || !stream) return
    const track = stream.getAudioTracks()[0]
    if (!track) return
    const onMute = () => {
      toast.error(t('Microphone permission was revoked'))
      stopRecording()
    }
    track.addEventListener('mute', onMute)
    track.addEventListener('inactive' as unknown as keyof MediaStreamTrackEventMap, onMute as EventListener)
    return () => {
      track.removeEventListener('mute', onMute)
      track.removeEventListener('inactive' as unknown as keyof MediaStreamTrackEventMap, onMute as EventListener)
    }
  }, [isRecording, stopRecording])

  // Cleanup on unmount (Pitfall 3, Pitfall 4)
  useEffect(() => () => {
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
    }
    speechRecognitionRef.current?.stop()
    abortControllerRef.current?.abort()
  }, [])

  // Revoke all photo preview object URLs on unmount (no leaks).
  useEffect(() => () => {
    for (const it of photoItemsRef.current) URL.revokeObjectURL(it.previewUrl)
  }, [])

  // Pipeline helper: set failure state
  function failAt(s: StageKey, msg: string) {
    setFailedAt(s)
    setErrorMessage(msg)
  }

  // Multi-modal helpers
  const hasAnyInput = !!audioBlob || descriptionText.trim().length > 0 || uploadedPhotos.length > 0

  // Handle photo file selection. Each accepted file gets an immediate
  // 'uploading' thumbnail placeholder that flips to 'done' (with its Photo) or
  // 'error'. Enforces the MAX_PHOTOS hard cap with a toast on overflow.
  const handlePhotoFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const images = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (images.length === 0) {
      if (photoInputRef.current) photoInputRef.current.value = ''
      return
    }

    // Cap math against the current item count (uploading + done + error).
    const currentCount = photoItemsRef.current.length
    const { take, overflowed } = clampToPhotoLimit(currentCount, images.length)
    if (overflowed) toast.info(t('You can add up to 16 photos.'))
    if (take <= 0) {
      if (photoInputRef.current) photoInputRef.current.value = ''
      return
    }
    const accepted = images.slice(0, take)

    const supabase = createClient()
    const storage = createStorage(supabase)

    // sort_order base: number of already-done photos. Each accepted file gets
    // base + its index among the accepted set, matching the prior semantics.
    const sortBase = photoItemsRef.current.filter(i => i.status === 'done').length

    await Promise.all(accepted.map(async (file, index) => {
      let blob: Blob
      try {
        blob = await compressImage(file, 2000, 0.85)
      } catch {
        blob = file
      }
      const photoId = crypto.randomUUID()
      const previewUrl = URL.createObjectURL(blob)
      const storagePath = `${companyId}/${projectId}/${photoId}.jpg`

      // Show the placeholder immediately (before awaiting upload).
      setPhotoItems(prev => [...prev, { id: photoId, status: 'uploading', previewUrl }])

      const flip = (status: PhotoItemStatus, photo?: Photo) =>
        setPhotoItems(prev => prev.map(it => it.id === photoId ? { ...it, status, photo } : it))

      try {
        await storage.upload('photos', storagePath, blob, { contentType: 'image/jpeg', upsert: false })
      } catch (err) {
        console.error('[capture] photo upload failed:', err)
        flip('error')
        return
      }

      const result = await createPhoto(projectId, storagePath, sortBase + index)
      if ('error' in result) {
        flip('error')
        return
      }
      const photo = result.data as Photo
      flip('done', photo)
      setUploadedPhotos(prev => [...prev, photo])
    }))

    if (photoInputRef.current) photoInputRef.current.value = ''
  }, [companyId, projectId, t])

  // Remove a photo from the strip; revoke its preview URL and best-effort
  // delete the server-side row/file once it was successfully created.
  const handleRemovePhoto = useCallback(async (itemId: string) => {
    const item = photoItemsRef.current.find(i => i.id === itemId)
    if (!item) return
    URL.revokeObjectURL(item.previewUrl)
    setPhotoItems(prev => prev.filter(i => i.id !== itemId))
    if (item.photo) {
      const photoId = item.photo.id
      setUploadedPhotos(prev => prev.filter(p => p.id !== photoId))
      try { await deletePhoto(photoId) } catch { /* best-effort */ }
    }
    if (photoInputRef.current) photoInputRef.current.value = ''
  }, [])

  // Trigger estimate generation (shared by text-only and photos-only paths)
  // Phase 67: route now returns { jobId }; poll until terminal, then read output.
  // Phase 73-02: forward estimateLanguage so cascade uses the user's selection.
  const triggerEstimateGeneration = useCallback(async () => {
    try {
      const dispatchRes = await fetch('/api/generate-estimate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          language: estimateLanguage,
          requestId: requestIdRef.current,
          attemptId: attemptIdRef.current,
          // Phase 92 (EVENT-03): tag the recording path explicitly for lineage.
          inputType: 'recording',
        }),
        signal: abortControllerRef.current.signal,
      })
      if (!dispatchRes.ok) {
        const body = await dispatchRes.json().catch(() => ({}))
        failAt('generating', (body as { error?: string }).error ?? t('Estimate generation failed'))
        return
      }
      const { jobId } = (await dispatchRes.json()) as { jobId: string }

      // Poll Inngest until the function reports terminal status. pollJob now
      // resolves Plan 01's JobResult discriminant (never throws on failure), so
      // branch on result.state instead of relying on a thrown error.
      const result = await pollJob(jobId, abortControllerRef.current.signal)
      if (result.state !== 'completed') {
        failAt('generating', reasonForJobState(result, 'generation'))
        return
      }
      // The Inngest dev server returns `output: ""` for our generate-estimate
      // function (see runPipeline note for root cause), so we read the
      // newly-current estimate row from the DB rather than result.output.
      const supabase = createClient()
      const { data: estRow } = await supabase
        .from('estimates')
        .select('id')
        .eq('project_id', projectId)
        .eq('is_current', true)
        .single()
      const estimateId = (estRow?.id as string | undefined) ?? null
      if (!estimateId) {
        const flags = result.output as { needsDetails?: boolean } | null
        let isNeedsDetails = flags?.needsDetails === true
        if (!isNeedsDetails) {
          const { data: proj } = await supabase
            .from('projects').select('status').eq('id', projectId).single()
          isNeedsDetails = (proj as { status?: string } | null)?.status === 'awaiting_details'
        }
        if (isNeedsDetails) {
          toast.error(t('Description too vague — please add more detail with specific tasks, materials, and quantities'))
          attemptIdRef.current = null
          requestIdRef.current = null
          setStage('idle')
          return
        }
        failAt('generating', t('Estimate generation completed but no estimate was found'))
        return
      }
      setStage('done')
      if (onComplete) {
        onComplete(estimateId)
      } else {
        router.push(`/projects/${projectId}?tab=estimate&estimate=${estimateId}`)
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      failAt('generating', (err as Error).message ?? t('Estimate generation failed'))
    }
  }, [projectId, router, t, estimateLanguage, onComplete, reasonForJobState])

  // Full AI pipeline (RESEARCH Pattern 5)
  const runPipeline = useCallback(async (blob: Blob) => {
    abortControllerRef.current = new AbortController()
    setStage('saving')
    setFailedAt(undefined)
    setErrorMessage(undefined)

    // REC-03/REC-04: mint the attempt lineage once (reused on Retry).
    ensureAttempt()

    const supabase = createClient()
    const storage = createStorage(supabase)

    // On a Retry, reuse the recording row created on the first run so the
    // transcribe event id (transcribe-${recordingId}) is stable → no re-upload,
    // no re-transcribe charge. Only upload + create the row on the first run.
    let recordingDbId = recordingIdRef.current
    if (!recordingDbId) {
      const recordingId = crypto.randomUUID()
      const ext = getFileExtension(mimeTypeRef.current)
      const storagePath = `${companyId}/${projectId}/${recordingId}.${ext}`

      // Upload to Supabase Storage
      try {
        await storage.upload('audio', storagePath, blob, { contentType: mimeTypeRef.current || 'audio/webm', upsert: false })
      } catch (err) {
        console.error('[capture] audio upload failed:', err)
        failAt('saving', err instanceof Error ? err.message : t('Failed to upload audio file'))
        return
      }

      // Create recording row
      const created = await createRecording(projectId, storagePath, Math.floor(elapsedMs / 1000))
      if ('error' in created) { failAt('saving', created.error ?? t('Failed to save recording')); return }
      recordingDbId = created.data.id as string
      recordingIdRef.current = recordingDbId
    }

    // Transcribe — Phase 67: dispatch returns { jobId }, poll until terminal.
    // NOTE: the Inngest dev server returns `output: ""` for our function despite
    // it returning { transcript } (multiple step.run + a fire-and-forget
    // `void notify(...)` at the end appear to drop the final return value from
    // the SDK's run output). The `save-transcript` step already persists the
    // transcript to recordings.transcript, so we read it from the DB once
    // pollJob signals Completed. Same pattern used by
    // components/workspace/ai-input-group/use-ai-input-submit.ts.
    setStage('transcribing')
    const dispatched = await transcribeRecording(recordingDbId, attemptIdRef.current ?? undefined)
    if ('error' in dispatched) {
      failAt('transcribing', dispatched.error ?? t('Transcription dispatch failed'))
      return
    }
    try {
      // pollJob resolves Plan 01's JobResult discriminant (never throws on
      // failure). Branch on result.state; only AbortError is still thrown.
      const transcribeResult = await pollJob(
        (dispatched.data as { jobId: string }).jobId,
        abortControllerRef.current.signal
      )
      if (transcribeResult.state !== 'completed') {
        failAt('transcribing', reasonForJobState(transcribeResult, 'transcription'))
        return
      }
      const { data: recRow } = await supabase
        .from('recordings')
        .select('transcript')
        .eq('id', recordingDbId)
        .single()
      const transcribedText = ((recRow?.transcript as string | null) ?? '').trim()
      if (!transcribedText) {
        failAt('transcribing', t("We couldn't catch your description | please try again or edit manually."))
        return
      }
      setTranscript(transcribedText)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      failAt('transcribing', (err as Error).message ?? t('Transcription failed'))
      return
    }

    // Generate estimate — Phase 67: dispatch + poll.
    setStage('analyzing')
    try {
      const dispatchRes = await fetch('/api/generate-estimate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          language: estimateLanguage,
          requestId: requestIdRef.current,
          attemptId: attemptIdRef.current,
          // Phase 92 (EVENT-03): tag the recording path explicitly for lineage.
          inputType: 'recording',
        }),
        signal: abortControllerRef.current.signal,
      })
      if (!dispatchRes.ok) {
        const body = await dispatchRes.json().catch(() => ({}))
        failAt('analyzing', (body as { error?: string }).error ?? t('Estimate generation failed'))
        return
      }
      const { jobId } = (await dispatchRes.json()) as { jobId: string }

      // Stepper progression: dispatch accepted → flip to "generating" while we poll.
      setStage('generating')

      // pollJob resolves Plan 01's JobResult discriminant; branch on state.
      // Same Inngest dev-server output quirk as transcription above — read the
      // newly-current estimate row from the DB instead of trusting result.output.
      const genResult = await pollJob(jobId, abortControllerRef.current.signal)
      if (genResult.state !== 'completed') {
        failAt('analyzing', reasonForJobState(genResult, 'generation'))
        return
      }
      const { data: estRow } = await supabase
        .from('estimates')
        .select('id')
        .eq('project_id', projectId)
        .eq('is_current', true)
        .single()
      const estimateId = (estRow?.id as string | undefined) ?? null
      if (!estimateId) {
        // The vague-estimate path ran: the AI generated no line items, auto-refine
        // ran once, estimate was deleted, and project.status set to 'awaiting_details'.
        // Check job output first (reliable in prod); fall back to project status (works in dev).
        const flags = genResult.output as { needsDetails?: boolean } | null
        let isNeedsDetails = flags?.needsDetails === true
        if (!isNeedsDetails) {
          const { data: proj } = await supabase
            .from('projects').select('status').eq('id', projectId).single()
          isNeedsDetails = (proj as { status?: string } | null)?.status === 'awaiting_details'
        }
        if (isNeedsDetails) {
          toast.error(t('Description too vague — please record again with specific tasks, materials, and quantities'))
          setAudioBlob(null)
          recordingIdRef.current = null
          attemptIdRef.current = null
          requestIdRef.current = null
          setStage('idle')
          return
        }
        failAt('analyzing', t('Estimate generation completed but no estimate was found'))
        return
      }
      setStage('done')
      if (onComplete) {
        onComplete(estimateId)
      } else {
        router.push(`/projects/${projectId}?tab=estimate&estimate=${estimateId}`)
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return  // unmount; not a user-facing failure
      failAt('analyzing', (err as Error).message ?? t('Estimate generation failed'))
    }
  }, [companyId, projectId, elapsedMs, router, estimateLanguage, onComplete, ensureAttempt, reasonForJobState, t])

  // Unified generation handler (text-only, audio, or photos-only)
  const handleGenerate = useCallback(async () => {
    abortControllerRef.current = new AbortController()
    setFailedAt(undefined)
    setErrorMessage(undefined)
    // REC-03/REC-04: mint the attempt lineage ONCE on first Generate; reused on Retry.
    ensureAttempt()

    if (descriptionText.trim() && !audioBlob && uploadedPhotos.length === 0) {
      // Text-only path: saving (createTextRecording) → generating (poll)
      setStage('saving')
      const recording = await createTextRecording(projectId, descriptionText.trim())
      if ('error' in recording) { failAt('saving', recording.error ?? t('Failed to save description')); return }
      setStage('generating')
      await triggerEstimateGeneration()
    } else if (audioBlob) {
      // Audio path (existing) — audio blob triggers runPipeline
      runPipeline(audioBlob)
    } else if (uploadedPhotos.length > 0) {
      // Photos-only path: analyze photos first so ai_description is written to DB,
      // then generate the estimate with that context.
      setStage('analyzing')
      try {
        // Step 1: dispatch photo analysis and wait for ai_description to be written
        const analyzeRes = await fetch('/api/analyze-photos', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            projectId,
            requestId: requestIdRef.current,
            attemptId: attemptIdRef.current,
          }),
          signal: abortControllerRef.current.signal,
        })
        if (!analyzeRes.ok) {
          const body = await analyzeRes.json().catch(() => ({}))
          failAt('analyzing', (body as { error?: string }).error ?? t('Photo analysis failed'))
          return
        }
        const { jobId: analyzeJobId } = (await analyzeRes.json()) as { jobId: string }
        const analyzeResult = await pollJob(analyzeJobId, abortControllerRef.current.signal)
        if (analyzeResult.state !== 'completed') {
          failAt('analyzing', reasonForJobState(analyzeResult, 'generation'))
          return
        }

        // Step 2: generate estimate (photos now have ai_description in DB)
        setStage('generating')
        const dispatchRes = await fetch('/api/generate-estimate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            projectId,
            language: estimateLanguage,
            requestId: requestIdRef.current,
            attemptId: attemptIdRef.current,
            inputType: 'photo',
          }),
          signal: abortControllerRef.current.signal,
        })
        if (!dispatchRes.ok) {
          const body = await dispatchRes.json().catch(() => ({}))
          failAt('generating', (body as { error?: string }).error ?? t('Estimate generation failed'))
          return
        }
        const { jobId } = (await dispatchRes.json()) as { jobId: string }
        // Read estimate from DB after completion — see runPipeline note for why
        // the Inngest dev server returns an empty function output.
        const photosResult = await pollJob(jobId, abortControllerRef.current.signal)
        if (photosResult.state !== 'completed') {
          failAt('generating', reasonForJobState(photosResult, 'generation'))
          return
        }
        const supabase = createClient()
        const { data: estRow } = await supabase
          .from('estimates')
          .select('id')
          .eq('project_id', projectId)
          .eq('is_current', true)
          .single()
        const estimateId = (estRow?.id as string | undefined) ?? null
        if (!estimateId) {
          const flags = photosResult.output as { needsDetails?: boolean } | null
          let isNeedsDetails = flags?.needsDetails === true
          if (!isNeedsDetails) {
            const { data: proj } = await supabase
              .from('projects').select('status').eq('id', projectId).single()
            isNeedsDetails = (proj as { status?: string } | null)?.status === 'awaiting_details'
          }
          if (isNeedsDetails) {
            toast.error(t('Photos too vague — please add a voice description or more detailed photos'))
            attemptIdRef.current = null
            requestIdRef.current = null
            setStage('idle')
            return
          }
          failAt('generating', t('Estimate generation completed but no estimate was found'))
          return
        }
        setStage('done')
        if (onComplete) {
          onComplete(estimateId)
        } else {
          router.push(`/projects/${projectId}?tab=estimate&estimate=${estimateId}`)
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        failAt('analyzing', (err as Error).message ?? t('Estimate generation failed'))
      }
    }
  }, [descriptionText, audioBlob, uploadedPhotos, projectId, runPipeline, triggerEstimateGeneration, estimateLanguage, t, onComplete, router, ensureAttempt, reasonForJobState])

  // Start recording
  const startRecording = useCallback(async () => {
    chunksRef.current = []
    setElapsedMs(0)
    warnedRef.current = false
    setLiveTranscript('')
    setInterimTranscript('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Create AudioContext inside click handler (iOS Safari requires user gesture — Pitfall 1)
      const audioContext = new AudioContext()
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const analyserNode = audioContext.createAnalyser()
      analyserNode.fftSize = 256
      source.connect(analyserNode)
      setAnalyser(analyserNode)

      const mimeType = getSupportedAudioMimeType()
      mimeTypeRef.current = mimeType
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        setAudioBlob(blob)
        // Pipeline fires after blob is set — use the blob directly
        runPipeline(blob)
      }

      recorder.start()
      startTimeRef.current = performance.now()
      setIsRecording(true)

      tickIntervalRef.current = setInterval(tick, TICK_MS)

      // Web Speech API for live transcript preview (horizontal layout, Chrome/Edge only)
      const w = window as typeof window & {
        SpeechRecognition?: SpeechRecognitionCtor
        webkitSpeechRecognition?: SpeechRecognitionCtor
      }
      const SpeechRecognitionAPI = w.SpeechRecognition ?? w.webkitSpeechRecognition
      if (SpeechRecognitionAPI) {
        const recognition = new SpeechRecognitionAPI()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = estimateLanguage === 'pt' ? 'pt-BR' : estimateLanguage === 'es' ? 'es-ES' : 'en-US'
        recognition.onresult = (event) => {
          let interim = ''
          let final = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const phrase = event.results[i][0].transcript
            if (event.results[i].isFinal) final += phrase + ' '
            else interim += phrase
          }
          if (final) setLiveTranscript(prev => prev + final)
          setInterimTranscript(interim)
        }
        recognition.onerror = () => {}
        recognition.start()
        speechRecognitionRef.current = recognition
      }
    } catch (err: unknown) {
      const error = err as { name?: string }
      if (error?.name === 'NotAllowedError') {
        toast.error(t('Microphone permission denied. Please allow microphone access and try again.'))
      } else if (error?.name === 'NotFoundError') {
        toast.error(t('No microphone found. Please connect a microphone and try again.'))
      } else {
        toast.error(t('Failed to start recording. Please try again.'))
      }
    }
  }, [tick, runPipeline])

  const handleToggleRecording = useCallback(() => {
    // design-decision: no in-recording cancel — see plan 18-02 acceptance
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  // Create a blank estimate then navigate — used by "Edit manually" so the user
  // lands on the EstimateEditor instead of the empty-state card (which has a
  // disabled Generate button when no transcript exists).
  async function handleEditManually() {
    await createBlankEstimate(projectId)
    router.push(`/projects/${projectId}`)
  }

  // Color class for ring and timer (D-07)
  const ringColorClass =
    elapsedMs >= RED_AT_MS    ? 'stroke-red-500'   :
    elapsedMs >= AMBER_AT_MS  ? 'stroke-amber-500' :
                                'stroke-primary'
  const progress = Math.min(elapsedMs / HARD_CAP_MS, 1)  // ring fill 0..1

  const isIdle = stage === 'idle'
  // NOTE: stage === 'done' intentionally NOT in showRecorderUI — it would
  // briefly flash the recorder UI back into view on the final tick before
  // onComplete() closes the dialog. The processing overlay keeps showing
  // until the parent dismisses the dialog.
  const showRecorderUI = isIdle

  // Effective mode for the progress stepper:
  // - popup flow: the single-modality lock wins (mode prop)
  // - legacy fullscreen route: infer from whichever input the user submitted
  const activeMode: CaptureMode =
    mode ?? (audioBlob ? 'audio' : uploadedPhotos.length > 0 ? 'photos' : 'text')

  const isPopup = variant === 'popup'
  const rootClassName = isPopup
    ? 'flex flex-col min-h-0'
    : 'flex flex-1 flex-col min-h-0'

  return (
    <div className={rootClassName} data-testid="capture-screen">
      {/* Header — hidden in popup mode (the Dialog supplies its own title chrome). */}
      {!isPopup && (
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm text-muted-foreground truncate">{project.name}</span>
          {/* Skip button only visible when idle and NOT recording and NO inputs */}
          {stage === 'idle' && !isRecording && !hasAnyInput && (
            <Button asChild variant="ghost" size="sm" data-testid="skip-recording">
              <Link href={`/projects/${projectId}`}>
                {t('Skip recording')}
                <X className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          )}
        </header>
      )}

      {/* Body */}
      {showRecorderUI ? (
        <RecorderBody
          analyser={analyser}
          isRecording={isRecording}
          elapsedMs={elapsedMs}
          ringColorClass={ringColorClass}
          progress={progress}
          onToggle={handleToggleRecording}
          // Multi-modal props
          descriptionText={descriptionText}
          setDescriptionText={setDescriptionText}
          uploadedPhotos={uploadedPhotos}
          isUploadingPhotos={isUploadingPhotos}
          photoItems={photoItems}
          onRemovePhoto={handleRemovePhoto}
          photoInputRef={photoInputRef}
          onPhotoFileChange={handlePhotoFileChange}
          hasAnyInput={hasAnyInput}
          onGenerate={handleGenerate}
          // Language selector
          estimateLanguage={estimateLanguage}
          setEstimateLanguage={setEstimateLanguage}
          // Single-modality lock (undefined in legacy fullscreen route → all three blocks)
          mode={mode}
          // Live transcript
          liveTranscript={liveTranscript}
          interimTranscript={interimTranscript}
          // Horizontal layout: popup with no mode lock
          isHorizontal={isPopup && mode === undefined}
        />
      ) : isPopup ? (
        // Popup variant — calm three-blue-dots overlay over a neutral surface.
        // `relative` provides the positioning context for the absolutely-positioned
        // overlay; `min-h-[260px]` ensures the overlay has visible space even on
        // short content (the parent Dialog already constrains max-height).
        <div className="relative flex-1 min-h-[260px]">
          {!failedAt && <CaptureProcessingOverlay stage={stage} />}
          {failedAt && (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="w-full max-w-md">
                <CaptureFailure
                  errorMessage={errorMessage ?? t('Something went wrong')}
                  retriesUsed={retriesUsed}
                  onRetry={audioBlob ? () => {
                    setRetriesUsed(r => r + 1)
                    runPipeline(audioBlob)
                  } : undefined}
                  onEditManually={handleEditManually}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        // Legacy fullscreen /capture route — keep the existing CaptureStepper UX.
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md space-y-6">
            <CaptureStepper currentStage={stage} failedAt={failedAt} transcript={transcript} mode={activeMode} />
            {failedAt && (
              <CaptureFailure
                errorMessage={errorMessage ?? t('Something went wrong')}
                retriesUsed={retriesUsed}
                onRetry={audioBlob ? () => {
                  setRetriesUsed(r => r + 1)
                  runPipeline(audioBlob)
                } : undefined}
                onEditManually={handleEditManually}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// RecorderBody — the visual recorder (waveform + timer + ring + mic button + inputs)
interface RecorderBodyProps {
  analyser: AnalyserNode | null
  isRecording: boolean
  elapsedMs: number
  ringColorClass: string
  progress: number
  onToggle: () => void
  // Multi-modal props
  descriptionText: string
  setDescriptionText: React.Dispatch<React.SetStateAction<string>>
  uploadedPhotos: Photo[]
  isUploadingPhotos: boolean
  photoItems: PhotoItem[]
  onRemovePhoto: (id: string) => void
  photoInputRef: React.RefObject<HTMLInputElement | null>
  onPhotoFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  hasAnyInput: boolean
  onGenerate: () => Promise<void>
  // Language selector props
  estimateLanguage: EstimateLanguage
  setEstimateLanguage: (lang: EstimateLanguage) => void
  // Single-modality lock — undefined renders the unified layout
  mode?: CaptureMode
  // Live transcript props (Web Speech API preview)
  liveTranscript: string
  interimTranscript: string
  // Horizontal 2-column layout (popup + unified mode)
  isHorizontal: boolean
}

function RecorderBody({ analyser, isRecording, elapsedMs, ringColorClass, progress, onToggle, descriptionText, setDescriptionText, uploadedPhotos, isUploadingPhotos, photoItems, onRemovePhoto, photoInputRef, onPhotoFileChange, hasAnyInput, onGenerate, estimateLanguage, setEstimateLanguage, mode, liveTranscript, interimTranscript, isHorizontal }: RecorderBodyProps) {
  const { t } = useTranslation()

  // Unified layout — responsive: stacked on mobile, 2-column on sm+
  if (isHorizontal) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* Body: stacked on mobile → side-by-side on sm+ */}
        <div className="flex flex-col sm:flex-row flex-1 min-h-0 overflow-hidden">

          {/* Text area — transcript preview while recording, manual input otherwise.
              Sits FIRST (left on desktop / top on mobile). */}
          <div className="flex flex-1 flex-col p-3 min-h-0">
            {isRecording ? (
              <div className="flex-1 rounded-md border border-input bg-muted/20 px-3 py-2 text-sm overflow-y-auto min-h-[170px] sm:min-h-[230px]">
                {liveTranscript || interimTranscript ? (
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {liveTranscript}
                    {interimTranscript && (
                      <span className="text-muted-foreground">{interimTranscript}</span>
                    )}
                  </p>
                ) : (
                  <p className="text-muted-foreground/60 italic text-xs leading-relaxed">
                    {t('Listening...')}
                  </p>
                )}
              </div>
            ) : (
              <textarea
                value={descriptionText}
                onChange={e => setDescriptionText(e.target.value)}
                placeholder={t('Describe the job here...')}
                className="flex-1 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[170px] sm:min-h-[230px]"
                data-testid="capture-description"
              />
            )}
          </div>

          {/* Mic section — FIRST on mobile (recording before the text), RIGHT
              column on desktop. The WHOLE area is a tap target; clicks on the
              inner mic button are skipped so its own onClick doesn't double-fire.
              VoiceRecorder (smStack) lays out wave/timer/label/mic responsively:
              [wave | label | mic] on mobile, [mic / wave / label] on desktop. */}
          <div
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button')) return
              onToggle()
            }}
            className="
              order-first sm:order-none flex items-center px-4 py-3 border-b shrink-0 cursor-pointer
              sm:border-b-0 sm:border-l sm:w-40 sm:py-5
            "
          >
            <VoiceRecorder
              size="sm"
              analyser={analyser}
              isRecording={isRecording}
              elapsedMs={elapsedMs}
              onToggle={onToggle}
              showTimer={true}
              micTestId="capture-mic"
              smStack
              helperText={isRecording ? t('Tap to stop') : t('Tap to record')}
              className="flex-1 sm:w-full"
            />
          </div>
        </div>

        {/* Per-photo thumbnail strip — only when items exist */}
        <PhotoThumbnailGrid items={photoItems} onRemove={onRemovePhoto} />

        {/* Footer: photos + language + generate */}
        <div className="border-t px-3 py-2.5 flex items-center gap-2 shrink-0 flex-wrap">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPhotoFileChange}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => photoInputRef.current?.click()}
            disabled={isUploadingPhotos || photoItems.length >= MAX_PHOTOS}
            data-testid="capture-add-photos"
          >
            {isUploadingPhotos ? (
              <LoadingDots className="mr-1.5" />
            ) : (
              <Camera className="h-4 w-4 mr-1.5" />
            )}
            {photoItems.length > 0 ? `${photoItems.length}/${MAX_PHOTOS}` : t('Photos')}
          </Button>
          <div className="flex-1" />
          <Button
            onClick={onGenerate}
            disabled={!hasAnyInput || isRecording}
            size="sm"
            data-testid="generate-estimate-btn"
          >
            {t('Generate')}
            <Sparkles className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      </div>
    )
  }

  // Stacked layout — single-mode popup (audio | text | photos) or legacy fullscreen route
  return (
    <div className="flex-1 flex flex-col overflow-y-auto min-h-0">
      {/* PRIMARY ACTION: glass card with waveform + timer + ring-wrapped mic */}
      {(mode === 'audio' || mode === undefined) && (
        <div className="px-4 pt-4 pb-2">
          <VoiceRecorder
            size="lg"
            analyser={analyser}
            isRecording={isRecording}
            elapsedMs={elapsedMs}
            onToggle={onToggle}
            showTimer={false}
            ringProgress={progress}
            ringColorClass={ringColorClass}
            micTestId="capture-mic"
            helperText={isRecording ? t('Tap to stop recording') : t('Tap to start recording')}
            belowWaveform={<CaptureTimer elapsedMs={elapsedMs} />}
          />
        </div>
      )}

      {/* "OR" divider — legacy fullscreen route only */}
      {mode === undefined && (
        <div className="px-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground uppercase tracking-wider">{t('or')}</span>
          <div className="flex-1 h-px bg-border" />
        </div>
      )}

      {(mode === 'text' || mode === undefined) && (
        <div className="px-4 pt-4">
          <textarea
            value={descriptionText}
            onChange={e => setDescriptionText(e.target.value)}
            placeholder={t('Or describe the job here...')}
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            data-testid="capture-description"
          />
        </div>
      )}

      {(mode === 'photos' || mode === undefined) && (
        <div className="px-4 pt-3">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPhotoFileChange}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => photoInputRef.current?.click()}
            disabled={isUploadingPhotos}
            data-testid="capture-add-photos"
          >
            {isUploadingPhotos ? (
              <LoadingDots className="mr-1.5" />
            ) : (
              <Camera className="h-4 w-4 mr-1.5" />
            )}
            {uploadedPhotos.length > 0 ? `${uploadedPhotos.length} ${t('photos')}` : t('Add Photos')}
          </Button>
        </div>
      )}

      <div className="px-4 pt-4 pb-2">
        <EstimateLanguageSelector value={estimateLanguage} onChange={setEstimateLanguage} />
      </div>
      {mode !== 'audio' && (
        <div className="px-4 pt-2 pb-6 sm:pb-8 mt-auto">
          <Button
            onClick={onGenerate}
            disabled={!hasAnyInput}
            className="w-full"
            size="lg"
            data-testid="generate-estimate-btn"
          >
            {t('Generate Estimate')}
          </Button>
        </div>
      )}
    </div>
  )
}

// PhotoThumbnailGrid — per-photo thumbnail strip with uploading / error overlays
// and a remove (×) button. Renders nothing when there are no items.
export function PhotoThumbnailGrid({ items, onRemove }: { items: PhotoItem[]; onRemove: (id: string) => void }) {
  const { t } = useTranslation()
  if (items.length === 0) return null
  return (
    <div className="border-t px-3 py-2.5 shrink-0" data-testid="capture-photo-grid">
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <div key={item.id} className="relative h-14 w-14 rounded-md overflow-hidden border border-border bg-muted/30 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
            {item.status === 'uploading' && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                <LoadingDots className="text-primary" dotClassName="h-2 w-2" />
              </div>
            )}
            {item.status === 'error' && (
              <div className="absolute inset-0 flex items-center justify-center bg-destructive/30">
                <X className="h-4 w-4 text-destructive-foreground" />
              </div>
            )}
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              aria-label={t('Remove photo')}
              className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-background/80 hover:bg-background flex items-center justify-center shadow"
              data-testid="capture-remove-photo"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
