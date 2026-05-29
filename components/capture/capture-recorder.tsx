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
import { createPhoto } from '@/lib/actions/photo'
import { createClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'
import { getSupportedAudioMimeType, getFileExtension } from '@/lib/utils/media-format'
import { compressImage } from '@/lib/utils/image-compressor'
import { Camera, Loader2 } from 'lucide-react'
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
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false)

  // Language for the estimate — default from app language (cascade layer 4)
  const [estimateLanguage, setEstimateLanguage] = useState<EstimateLanguage>(
    appLanguage === 'pt' || appLanguage === 'es' ? appLanguage : 'en'
  )

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
    setAnalyser(null)
    setIsRecording(false)
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
    abortControllerRef.current?.abort()
  }, [])

  // Pipeline helper: set failure state
  function failAt(s: StageKey, msg: string) {
    setFailedAt(s)
    setErrorMessage(msg)
  }

  // Multi-modal helpers
  const hasAnyInput = !!audioBlob || descriptionText.trim().length > 0 || uploadedPhotos.length > 0

  // Handle photo file selection
  const handlePhotoFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setIsUploadingPhotos(true)
    const newPhotos: Photo[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      try {
        var blob = await compressImage(file, 2000, 0.85)
      } catch {
        blob = file
      }
      const photoId = crypto.randomUUID()
      const storagePath = `${companyId}/${projectId}/${photoId}.jpg`
      const supabase = createClient()
      const storage = createStorage(supabase)
      try {
        await storage.upload('photos', storagePath, blob, { contentType: 'image/jpeg', upsert: false })
      } catch (err) {
        console.error('[capture] photo upload failed:', err)
        continue
      }
      const result = await createPhoto(projectId, storagePath, uploadedPhotos.length + newPhotos.length)
      if ('error' in result) continue
      newPhotos.push(result.data as Photo)
    }
    setIsUploadingPhotos(false)
    setUploadedPhotos(prev => [...prev, ...newPhotos])
    if (photoInputRef.current) photoInputRef.current.value = ''
  }, [companyId, projectId, uploadedPhotos.length])

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
      // Photos-only path: photos were uploaded during selection (saving already done),
      // so we jump straight to analyzing (dispatch) → generating (poll).
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
          }),
          signal: abortControllerRef.current.signal,
        })
        if (!dispatchRes.ok) {
          const body = await dispatchRes.json().catch(() => ({}))
          failAt('analyzing', (body as { error?: string }).error ?? t('Estimate generation failed'))
          return
        }
        const { jobId } = (await dispatchRes.json()) as { jobId: string }
        setStage('generating')
        // pollJob resolves Plan 01's JobResult discriminant; branch on state.
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
    }
  }, [descriptionText, audioBlob, uploadedPhotos, projectId, runPipeline, triggerEstimateGeneration, estimateLanguage, t, onComplete, router, ensureAttempt, reasonForJobState])

  // Start recording
  const startRecording = useCallback(async () => {
    chunksRef.current = []
    setElapsedMs(0)
    warnedRef.current = false

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
          photoInputRef={photoInputRef}
          onPhotoFileChange={handlePhotoFileChange}
          hasAnyInput={hasAnyInput}
          onGenerate={handleGenerate}
          // Language selector
          estimateLanguage={estimateLanguage}
          setEstimateLanguage={setEstimateLanguage}
          // Single-modality lock (undefined in legacy fullscreen route → all three blocks)
          mode={mode}
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
                  onEditManually={() => {
                    toast.info(t('Continue manually in the workspace tabs.'))
                    router.push(`/projects/${projectId}`)
                  }}
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
                onEditManually={() => {
                  toast.info(t('Continue manually in the workspace tabs.'))
                  router.push(`/projects/${projectId}`)
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// RecorderBody — the full-screen visual recorder (waveform + timer + ring + mic button)
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
  photoInputRef: React.RefObject<HTMLInputElement | null>
  onPhotoFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  hasAnyInput: boolean
  onGenerate: () => Promise<void>
  // Language selector props
  estimateLanguage: EstimateLanguage
  setEstimateLanguage: (lang: EstimateLanguage) => void
  // Single-modality lock — undefined renders the legacy all-three-inputs layout
  mode?: CaptureMode
}

function RecorderBody({ analyser, isRecording, elapsedMs, ringColorClass, progress, onToggle, descriptionText, setDescriptionText, uploadedPhotos, isUploadingPhotos, photoInputRef, onPhotoFileChange, hasAnyInput, onGenerate, estimateLanguage, setEstimateLanguage, mode }: RecorderBodyProps) {
  const { t } = useTranslation()
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

      {/* "OR" divider — separates primary mic action from secondary text/photo path.
          Rendered ONLY in the legacy fullscreen route (mode === undefined). */}
      {mode === undefined && (
        <div className="px-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground uppercase tracking-wider">{t('or')}</span>
          <div className="flex-1 h-px bg-border" />
        </div>
      )}

      {/* Secondary inputs: text + photos */}
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
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Camera className="h-4 w-4 mr-1.5" />
            )}
            {uploadedPhotos.length > 0 ? `${uploadedPhotos.length} ${t('photos')}` : t('Add Photos')}
          </Button>
        </div>
      )}

      {/* Language selector — visible in all modes (used by runPipeline in audio too) */}
      <div className="px-4 pt-4 pb-2">
        <EstimateLanguageSelector
          value={estimateLanguage}
          onChange={setEstimateLanguage}
        />
      </div>
      {/* Generate Estimate button — hidden in audio mode (recorder.onstop auto-triggers runPipeline) */}
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
