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
import { startRecordingPipeline, createTextRecording, reportClientPipelineFailure } from '@/lib/actions/recording'
import { createBlankEstimate } from '@/lib/actions/estimate'
import { createPhoto, deletePhoto } from '@/lib/actions/photo'
import { createClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'
import { getSupportedAudioMimeType, getFileExtension } from '@/lib/utils/media-format'
import { cn } from '@/lib/utils'
import { compressImage, isLikelyHeic } from '@/lib/utils/image-compressor'
import { Camera, Sparkles, Mic, MicOff } from 'lucide-react'
import { LoadingDots } from '@/components/ui/loading-dots'
import { WaveformVisualizer } from '@/components/workspace/audio/waveform-visualizer'
import type { ProjectDetail } from '@/lib/queries/project'
import type { Photo } from '@/lib/queries/photo'
import { pollJob, type JobResult } from '@/hooks/use-job-status'
import { pollEstimateOutcome, getCurrentEstimateId, type EstimateOutcome } from '@/lib/estimate/poll-outcome'
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

// Draft persistence — the typed description survives closing the popup (outside
// click / X / Escape) so it can be restored on the next open. Keyed per flow
// ('new' vs an existing project's id) so an edit-mode draft never bleeds into
// the new-project draft. Cleared once an estimate is successfully generated.
const DRAFT_PREFIX = 'xtimator:capture-draft:'
const draftStorageKey = (key: string) => `${DRAFT_PREFIX}${key}`

function readDraft(key: string | undefined): string {
  if (typeof window === 'undefined' || !key) return ''
  try {
    return localStorage.getItem(draftStorageKey(key)) ?? ''
  } catch {
    return ''
  }
}

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

// Minimum meaningful recording length — anything shorter is blocked client-side
// (pre-flight) so the server's B10 duration validation can never reject a real take.
export const MIN_RECORDING_MS = 1000
// Wall-clock elapsed → whole seconds for createRecording. Clamped to >=1 as
// belt-and-braces: the server rejects 0 (pre-launch audit B10).
export function finalizeDurationSeconds(elapsedMs: number): number {
  return Math.max(1, Math.floor(elapsedMs / 1000))
}

// 260707-hhp (P1 client half): pollJob (hooks/use-job-status.ts, read-only) rethrows
// a signal-abort as a plain Error with message 'Aborted' — NOT a DOMException named
// 'AbortError' — because its internal catch block re-throws `new Error('Aborted')`
// rather than preserving the caught exception. pollEstimateOutcome (our new module)
// correctly throws a DOMException named 'AbortError'. Since the dispatch-and-watch
// race below awaits both, check both shapes so an unmount during the race is always
// a silent return, never a failAt (plan constraint) — regardless of which side's
// abort exception happens to win the race.
function isAbortSignal(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null | undefined
  return e?.name === 'AbortError' || e?.message === 'Aborted'
}

type OutcomeRaceResult =
  | { kind: 'outcome'; outcome: EstimateOutcome }
  | { kind: 'job-failed'; result: JobResult }

/**
 * Runs pollEstimateOutcome (DB truth) alongside pollJob (fast-failure signal for
 * the transcribe/analyze step it's racing) concurrently. The job race exists
 * ONLY to (a) fast-fail a run Inngest itself reports as `failed` and (b) advance
 * photo-path progress on `completed` — pollEstimateOutcome (the DB) is the
 * single source of truth for success/failure of the attempt.
 *
 * `completed` is progress information ONLY — the outcome poll still owns
 * completion, so it is NOT a race winner; we keep waiting on the outcome poll.
 * `not_found` / `config_unavailable` are ADVISORY (260707-kgn) — production
 * evidence showed a not_found snapshot moments before the run appeared and the
 * attempt succeeded seconds later (Inngest creates the run after accepting the
 * event; hooks/use-job-status.ts also grace-periods this at the source, but an
 * in-flight race predating that grace window — or a job genuinely still
 * invisible — must not fail the UI either). Neither state may ever win the race
 * or produce a user-facing failure: it's logged for diagnosis and the outcome
 * poll is re-awaited. Only `failed` short-circuits the wait (abort the outcome
 * poll, surface the failure) — the outcome poll's own 6-minute timeout already
 * covers the genuinely-dead case with a friendly message.
 *
 * Whichever side stops being useful is aborted via a child AbortController
 * derived from the caller's signal so it doesn't keep polling in the background
 * after we've moved on.
 */
async function raceEstimateOutcomeAgainstJob(params: {
  jobId: string
  projectId: string
  previousEstimateId: string | null
  parentSignal: AbortSignal
  recordingId?: string
  onTranscriptReady?: () => void
  onJobCompleted?: () => void
}): Promise<OutcomeRaceResult> {
  const child = new AbortController()
  const onParentAbort = () => child.abort()
  if (params.parentSignal.aborted) child.abort()
  else params.parentSignal.addEventListener('abort', onParentAbort, { once: true })

  const outcomePromise = pollEstimateOutcome({
    projectId: params.projectId,
    previousEstimateId: params.previousEstimateId,
    signal: child.signal,
    recordingId: params.recordingId,
    onTranscriptReady: params.onTranscriptReady,
  })
  const jobPromise = pollJob(params.jobId, child.signal)

  try {
    let firstSettled = await Promise.race([
      outcomePromise.then((outcome) => ({ kind: 'outcome' as const, outcome })),
      jobPromise.then((result) => ({ kind: 'job' as const, result })),
    ])

    if (
      firstSettled.kind === 'job' &&
      firstSettled.result.state !== 'completed' &&
      firstSettled.result.state !== 'failed'
    ) {
      // Advisory-only (not_found / config_unavailable) — this can never win the
      // race. Log for diagnosis, swallow it, and keep waiting on the DB truth.
      console.warn(
        '[capture] job race saw advisory state — ignoring, DB outcome poll remains authoritative:',
        firstSettled.result.state
      )
      firstSettled = { kind: 'outcome', outcome: await outcomePromise }
    }

    if (firstSettled.kind === 'job') {
      if (firstSettled.result.state === 'failed') {
        child.abort() // fast failure — the outcome poll is no longer useful
        return { kind: 'job-failed', result: firstSettled.result }
      }
      // 'completed' — progress only; the outcome poll remains the source of truth.
      params.onJobCompleted?.()
      const outcome = await outcomePromise
      child.abort()
      return { kind: 'outcome', outcome }
    }

    child.abort() // outcome won — the job poll is no longer needed
    return { kind: 'outcome', outcome: firstSettled.outcome }
  } finally {
    params.parentSignal.removeEventListener('abort', onParentAbort)
    // Swallow the loser's rejection (its own abort exception once `child` aborts)
    // — only the winner's settlement (or a genuine early rejection) drives the caller.
    outcomePromise.catch(() => {})
    jobPromise.catch(() => {})
  }
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
  /**
   * When set, the typed description is persisted to localStorage under this key
   * so closing the popup (outside click / X / Escape) preserves the draft and
   * the next open restores it. The draft is cleared on successful generation.
   * Omit to disable draft persistence (legacy fullscreen /capture route).
   */
  draftKey?: string
  /**
   * When true, photos already attached to `project` are loaded into the strip
   * on mount — so photos uploaded before the popup was closed reappear when it
   * reopens (the New Xtimate draft-resume flow). Omit/false leaves the strip
   * empty (legacy fullscreen route + edit mode).
   */
  restorePhotos?: boolean
  /**
   * When provided, a "Start from scratch" link is shown in the popup footer.
   * The parent creates a blank estimate and navigates to the editor directly,
   * bypassing AI generation. Only passed in new-project mode (not edit mode).
   */
  onStartBlank?: () => Promise<void>
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
  draftKey,
  restorePhotos = false,
  onStartBlank,
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
  const [retriesUsed, setRetriesUsed] = useState(0)

  // Multi-modal input state. Lazy-init from the saved draft (if any) so reopening
  // the popup restores the text the user typed before closing it.
  const [descriptionText, setDescriptionText] = useState(() => readDraft(draftKey))
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
  // Wall-clock elapsed mirror (RESEARCH Pattern 4 / 260707-grq): runPipeline reads
  // this ref instead of the `elapsedMs` state closure, which is stale by the time
  // recorder.onstop fires (root cause of the duration=0 production bug).
  const elapsedMsRef = useRef(0)

  // Mirror photoItems into a ref so the unmount cleanup + remove handler read
  // the latest items without re-subscribing / re-creating callbacks.
  const photoItemsRef = useRef<PhotoItem[]>([])
  useEffect(() => { photoItemsRef.current = photoItems }, [photoItems])

  // Mirror audioBlob/uploadedPhotos into refs so failAt's client-telemetry read
  // (260707-grq) doesn't turn it into a value reactive on component state —
  // that would force every useCallback that calls failAt (runPipeline,
  // handleGenerate) to list it as a dependency, widening their memoization and
  // re-creating them more often than before.
  const audioBlobRef = useRef<Blob | null>(null)
  useEffect(() => { audioBlobRef.current = audioBlob }, [audioBlob])
  const uploadedPhotosRef = useRef<Photo[]>([])
  useEffect(() => { uploadedPhotosRef.current = uploadedPhotos }, [uploadedPhotos])

  // recorder.onstop is bound ONCE at recording start; calling runPipeline through a
  // ref guarantees the LATEST closure (fresh estimateLanguage, elapsed refs) runs at stop
  // — the direct call captured the start-time render where elapsedMs was still 0
  // (root cause of the duration=0 bug, 260707-grq).
  const runPipelineRef = useRef<(blob: Blob) => Promise<void>>(async () => {})

  // Persist the typed description as the user types so any close path (outside
  // click, X, Escape) keeps the draft. Empty text clears the stored draft.
  useEffect(() => {
    if (typeof window === 'undefined' || !draftKey) return
    try {
      if (descriptionText.trim()) {
        localStorage.setItem(draftStorageKey(draftKey), descriptionText)
      } else {
        localStorage.removeItem(draftStorageKey(draftKey))
      }
    } catch {
      /* storage unavailable (private mode / quota) — draft just isn't persisted */
    }
  }, [descriptionText, draftKey])

  // Once an estimate is successfully generated, the draft has served its purpose
  // — drop it so the next New Xtimate opens clean.
  useEffect(() => {
    if (stage !== 'done' || typeof window === 'undefined' || !draftKey) return
    try {
      localStorage.removeItem(draftStorageKey(draftKey))
    } catch {
      /* best-effort */
    }
  }, [stage, draftKey])

  // Rehydrate photos already attached to this (resumed draft) project so they
  // reappear in the strip after the popup was closed and reopened. Signed URLs
  // back the thumbnails — not blob: object URLs — so the unmount revoke is a
  // harmless no-op for them.
  useEffect(() => {
    if (!restorePhotos) return
    let cancelled = false
    void (async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('photos')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
      const photos = (data ?? []) as Photo[]
      if (cancelled || photos.length === 0) return
      const storage = createStorage(supabase)
      const items = await Promise.all(
        photos.map(async (photo): Promise<PhotoItem | null> => {
          try {
            const previewUrl = await storage.getSignedUrl('photos', photo.storage_path, 3600)
            return { id: photo.id, status: 'done', previewUrl, photo }
          } catch {
            return null
          }
        })
      )
      if (cancelled) return
      const valid = items.filter((i): i is PhotoItem => i !== null)
      if (valid.length === 0) return
      setPhotoItems(valid)
      setUploadedPhotos(photos)
    })()
    return () => { cancelled = true }
  }, [restorePhotos, projectId])

  // REC-03/REC-04 attempt lineage. attemptId/requestId are minted ONCE on the
  // first Generate and reused on Retry (NOT reset) so the generate-estimate
  // event id (estimate-${projectId}-${requestId}) is stable → Inngest dedups a
  // re-dispatch and an already-completed step is not re-charged. recordingIdRef
  // holds the recording row id so a Retry reuses the same transcribe event id
  // (transcribe-${recordingId}) instead of re-uploading + re-transcribing.
  const attemptIdRef = useRef<string | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const recordingIdRef = useRef<string | null>(null)
  // 260707-hhp (P1 client half): dispatch-and-watch outcome baseline. `undefined`
  // means "not yet captured this attempt" (a distinct sentinel from a real `null`,
  // which means "no current estimate exists yet"). Captured ONCE per attempt
  // (before the first dispatch) and deliberately NOT re-read on Retry — a
  // half-finished first try's estimate must still count as NEW.
  const previousEstimateIdRef = useRef<string | null | undefined>(undefined)

  // Mint the attempt + request lineage once; subsequent calls (Retry) are no-ops.
  const ensureAttempt = useCallback(() => {
    if (!attemptIdRef.current) attemptIdRef.current = crypto.randomUUID()
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID()
  }, [])

  // Capture the pre-dispatch outcome baseline once per attempt (see ref comment
  // above). Called at the top of each path's dispatch, after ensureAttempt().
  const captureOutcomeBaseline = useCallback(async () => {
    if (previousEstimateIdRef.current === undefined) {
      previousEstimateIdRef.current = await getCurrentEstimateId(projectId)
    }
  }, [projectId])

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
      // Snapshot the final wall-clock BEFORE .stop() — recorder.onstop reads
      // elapsedMsRef (not the elapsedMs state closure) via runPipelineRef (260707-grq).
      elapsedMsRef.current = performance.now() - startTimeRef.current
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
    elapsedMsRef.current = elapsed
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

  // Pipeline helper: set failure state + best-effort client-side telemetry so a failure
  // in the CLIENT leg of the pipeline is still visible in /admin/events (260707-grq).
  // useCallback (dep: projectId only — audioBlob/uploadedPhotos/attemptId are read via
  // refs above) keeps this referentially stable so the callers' manual dependency
  // arrays (which list `failAt`) don't get recreated on every render.
  const failAt = useCallback((s: StageKey, msg: string) => {
    setFailedAt(s)
    setErrorMessage(msg)
    const stepMap = {
      saving: 'save_recording',
      transcribing: 'transcribe',
      analyzing: 'analyze',
      generating: 'generate_estimate',
    } as const
    void reportClientPipelineFailure({
      attemptId: attemptIdRef.current ?? crypto.randomUUID(),
      projectId,
      step: stepMap[s],
      inputType: audioBlobRef.current ? 'recording' : uploadedPhotosRef.current.length > 0 ? 'photo' : 'manual_text',
      errorMessage: msg,
    }).catch(() => {})
  }, [projectId])

  // 260707-hhp (P1 client half): shared outcome handling for all three
  // dispatch-and-watch paths (audio/text/photos) — completed → done/onComplete;
  // awaiting_details → the path-specific vague toast + full attempt reset;
  // timeout → a friendly failAt explaining generation may still finish in the
  // background. `vagueMessage` is an inline t('...') literal at each call site
  // (extractor requirement) forwarded in as a plain string.
  const handleEstimateOutcome = useCallback((outcome: EstimateOutcome, vagueMessage: string) => {
    if (outcome.state === 'completed') {
      setStage('done')
      if (onComplete) {
        onComplete(outcome.estimateId)
      } else {
        router.push(`/projects/${projectId}?tab=estimate&estimate=${outcome.estimateId}`)
      }
      return
    }
    if (outcome.state === 'awaiting_details') {
      toast.error(vagueMessage)
      setAudioBlob(null)
      recordingIdRef.current = null
      attemptIdRef.current = null
      requestIdRef.current = null
      previousEstimateIdRef.current = undefined
      setStage('idle')
      return
    }
    // timeout
    failAt('generating', t('Generation is taking longer than expected. It may still complete in the background — check the project in a minute, or retry.'))
  }, [onComplete, projectId, router, t, failAt])

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
      // Pre-launch audit fix: HEIC/HEIF (iPhone default camera format) can't
      // be decoded by <canvas> in most browsers — reject with a clear
      // message rather than silently uploading raw HEIC bytes mislabeled
      // as image/jpeg (which broke thumbnails and AI photo analysis).
      if (await isLikelyHeic(file)) {
        toast.error(
          t('HEIC photos aren\'t supported. On iPhone, go to Settings > Camera > Formats and choose "Most Compatible".')
        )
        return
      }

      let blob: Blob
      try {
        blob = await compressImage(file, 2000, 0.85)
      } catch {
        toast.error(t('Failed to process photo'))
        return
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

  // 260707-hhp (P1 client half): dispatch-and-watch audio pipeline. ONE server
  // round trip (startRecordingPipeline — Plan 01) creates the recording row +
  // dispatches the transcribe→generate chain; the client then only WATCHES the
  // database for the outcome via pollEstimateOutcome. pollJob is kept ONLY as a
  // fast-failure race on the transcribe job (see raceEstimateOutcomeAgainstJob)
  // — a completed transcribe job is progress information, never treated as the
  // race winner, since the outcome poll alone owns completion.
  const runPipeline = useCallback(async (blob: Blob) => {
    abortControllerRef.current = new AbortController()
    setStage('saving')
    setFailedAt(undefined)
    setErrorMessage(undefined)

    // Pre-flight (hardening before the server): a zero-byte blob or sub-second take can
    // never produce a transcript — surface it instantly instead of uploading and letting
    // the server's B10 validation reject it.
    if (blob.size === 0 || elapsedMsRef.current < MIN_RECORDING_MS) {
      toast.error(t('Recording too short — please record at least a few seconds describing the job.'))
      setAudioBlob(null)
      setStage('idle')
      return
    }

    // REC-03/REC-04: mint the attempt lineage once (reused on Retry).
    ensureAttempt()
    // Baseline captured BEFORE dispatch, once per attempt — reused (not re-read) on Retry.
    await captureOutcomeBaseline()

    // On a Retry, reuse the recording row created on the first run — skip the
    // upload + let startRecordingPipeline re-dispatch only (transcribe event id
    // transcribe-${recordingId} is idempotent; no re-upload, no double charge).
    let storagePath: string | undefined
    if (!recordingIdRef.current) {
      const fileNameId = crypto.randomUUID()
      const ext = getFileExtension(mimeTypeRef.current)
      storagePath = `${companyId}/${projectId}/${fileNameId}.${ext}`
      try {
        await createStorage(createClient()).upload('audio', storagePath, blob, {
          contentType: mimeTypeRef.current || 'audio/webm',
          upsert: false,
        })
      } catch (err) {
        console.error('[capture] audio upload failed:', err)
        failAt('saving', err instanceof Error ? err.message : t('Failed to upload audio file'))
        return
      }
    }

    const started = await startRecordingPipeline({
      projectId,
      storagePath,
      // Reads the wall-clock ref (not the elapsedMs state closure, which is
      // stale by the time recorder.onstop fires; 260707-grq).
      durationSeconds: storagePath ? finalizeDurationSeconds(elapsedMsRef.current) : undefined,
      recordingId: recordingIdRef.current ?? undefined,
      attemptId: attemptIdRef.current!,
      requestId: requestIdRef.current!,
      estimateLanguage,
    })
    if ('error' in started) {
      failAt('saving', started.error ?? t('Failed to save recording'))
      return
    }
    recordingIdRef.current = started.data.recordingId

    setStage('transcribing')
    try {
      const raced = await raceEstimateOutcomeAgainstJob({
        jobId: started.data.transcribeJobId,
        projectId,
        previousEstimateId: previousEstimateIdRef.current ?? null,
        parentSignal: abortControllerRef.current.signal,
        recordingId: recordingIdRef.current,
        onTranscriptReady: () => setStage('generating'),
      })

      if (raced.kind === 'job-failed') {
        failAt('transcribing', reasonForJobState(raced.result, 'transcription'))
        return
      }

      handleEstimateOutcome(
        raced.outcome,
        t('Description too vague — please record again with specific tasks, materials, and quantities')
      )
    } catch (err) {
      if (isAbortSignal(err)) return  // unmount; not a user-facing failure
      failAt('generating', (err as Error).message ?? t('Estimate generation failed'))
    }
  }, [companyId, projectId, estimateLanguage, ensureAttempt, captureOutcomeBaseline, reasonForJobState, t, failAt, handleEstimateOutcome])

  // Mirror the latest runPipeline closure into a ref — recorder.onstop is bound
  // ONCE at recording start and must invoke the LATEST closure (fresh
  // estimateLanguage/onComplete/elapsed refs), not the one captured at start (260707-grq).
  useEffect(() => { runPipelineRef.current = runPipeline }, [runPipeline])

  // Unified generation handler (text-only, audio, or photos-only)
  const handleGenerate = useCallback(async () => {
    abortControllerRef.current = new AbortController()
    setFailedAt(undefined)
    setErrorMessage(undefined)
    // REC-03/REC-04: mint the attempt lineage ONCE on first Generate; reused on Retry.
    ensureAttempt()

    if (descriptionText.trim() && !audioBlob && uploadedPhotos.length === 0) {
      // Text-only path: ONE dispatch (createTextRecording's autoGenerateEstimate
      // chain — Plan 01) then watch the DB. No separate job to race — the
      // dispatch either succeeded (jobId returned) or returned { error }.
      setStage('saving')
      await captureOutcomeBaseline()
      const recording = await createTextRecording(projectId, descriptionText.trim(), attemptIdRef.current ?? undefined, {
        autoGenerateEstimate: true,
        requestId: requestIdRef.current ?? undefined,
        estimateLanguage,
      })
      if ('error' in recording) { failAt('saving', recording.error ?? t('Failed to save description')); return }
      setStage('generating')
      try {
        const outcome = await pollEstimateOutcome({
          projectId,
          previousEstimateId: previousEstimateIdRef.current ?? null,
          signal: abortControllerRef.current.signal,
        })
        handleEstimateOutcome(
          outcome,
          t('Description too vague — please add more detail with specific tasks, materials, and quantities')
        )
      } catch (err) {
        if (isAbortSignal(err)) return
        failAt('generating', (err as Error).message ?? t('Estimate generation failed'))
      }
    } else if (audioBlob) {
      // Audio path (existing) — audio blob triggers runPipeline
      runPipeline(audioBlob)
    } else if (uploadedPhotos.length > 0) {
      // Photos-only path: dispatch photo analysis (autoGenerateEstimate chain —
      // Plan 01), racing pollJob(analyzeJobId) ONLY as a fast-failure signal
      // (mirrors the audio path); the outcome poll owns completion.
      setStage('analyzing')
      await captureOutcomeBaseline()
      try {
        const analyzeRes = await fetch('/api/analyze-photos', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            projectId,
            requestId: requestIdRef.current,
            attemptId: attemptIdRef.current,
            autoGenerateEstimate: true,
            estimateLanguage,
          }),
          signal: abortControllerRef.current.signal,
        })
        if (!analyzeRes.ok) {
          const body = await analyzeRes.json().catch(() => ({}))
          failAt('analyzing', (body as { error?: string }).error ?? t('Photo analysis failed'))
          return
        }
        const { jobId: analyzeJobId } = (await analyzeRes.json()) as { jobId: string }

        const raced = await raceEstimateOutcomeAgainstJob({
          jobId: analyzeJobId,
          projectId,
          previousEstimateId: previousEstimateIdRef.current ?? null,
          parentSignal: abortControllerRef.current.signal,
          // The analyze job poll's OWN "completed" is progress here (photos
          // analyzed, generation chain dispatched) — not the race winner.
          onJobCompleted: () => setStage('generating'),
        })

        if (raced.kind === 'job-failed') {
          failAt('analyzing', reasonForJobState(raced.result, 'generation'))
          return
        }

        handleEstimateOutcome(
          raced.outcome,
          t('Photos too vague — please add a voice description or more detailed photos')
        )
      } catch (err) {
        if (isAbortSignal(err)) return
        failAt('analyzing', (err as Error).message ?? t('Estimate generation failed'))
      }
    }
  }, [descriptionText, audioBlob, uploadedPhotos, projectId, runPipeline, estimateLanguage, t, ensureAttempt, captureOutcomeBaseline, reasonForJobState, failAt, handleEstimateOutcome])

  // Start recording
  const startRecording = useCallback(async () => {
    chunksRef.current = []
    setElapsedMs(0)
    elapsedMsRef.current = 0
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
        // Pipeline fires after blob is set — call through runPipelineRef so the
        // LATEST closure runs at stop, not the one bound when onstop was assigned
        // at recording start (260707-grq: root cause of the duration=0 bug).
        void runPipelineRef.current(blob)
      }

      recorder.start()
      startTimeRef.current = performance.now()
      setIsRecording(true)

      tickIntervalRef.current = setInterval(tick, TICK_MS)

      // Web Speech API live transcript preview follows the device/spoken language (navigator.language),
      // independent of estimateLanguage which only controls the generated estimate output (Chrome/Edge only)
      const w = window as typeof window & {
        SpeechRecognition?: SpeechRecognitionCtor
        webkitSpeechRecognition?: SpeechRecognitionCtor
      }
      const SpeechRecognitionAPI = w.SpeechRecognition ?? w.webkitSpeechRecognition
      if (SpeechRecognitionAPI) {
        const recognition = new SpeechRecognitionAPI()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = navigator.language || 'en-US'
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
          onStartBlank={onStartBlank}
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
            {/* 260707-hhp (P1 client half): the dispatch-and-watch model no longer reads
                the transcript text client-side (only a stage-progression signal via
                onTranscriptReady) — the mid-generation transcript preview is dropped. */}
            <CaptureStepper currentStage={stage} failedAt={failedAt} mode={activeMode} />
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
  onStartBlank?: () => Promise<void>
}

function RecorderBody({ analyser, isRecording, elapsedMs, ringColorClass, progress, onToggle, descriptionText, setDescriptionText, uploadedPhotos, isUploadingPhotos, photoItems, onRemovePhoto, photoInputRef, onPhotoFileChange, hasAnyInput, onGenerate, estimateLanguage, setEstimateLanguage, mode, liveTranscript, interimTranscript, isHorizontal, onStartBlank }: RecorderBodyProps) {
  const { t } = useTranslation()

  // Unified layout — responsive: stacked on mobile, 2-column on sm+
  if (isHorizontal) {
    // For the mobile popup redesign: immersive glassmorphism layout
    return (
      <div className="flex flex-col flex-1 min-h-0 relative bg-background">
        
        {/* Z-0: Main Text Area (Borderless, full canvas) */}
        <div className="flex flex-col flex-1 min-h-0 relative z-0 p-4 pb-32">
           <textarea
             value={descriptionText}
             onChange={e => setDescriptionText(e.target.value)}
             placeholder={t('Describe the job here...')}
             className="flex-1 w-full resize-none border-none bg-transparent text-base sm:text-lg placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0 leading-relaxed"
             data-testid="capture-description"
           />
           {onStartBlank && !descriptionText.trim() && !isRecording && (
             <div className="mt-4 flex justify-center pb-8">
               <button
                 type="button"
                 onClick={onStartBlank}
                 className="text-xs sm:text-sm text-muted-foreground/80 hover:text-foreground transition-colors py-2 px-4 rounded-full bg-muted/20 hover:bg-muted/40"
                 data-testid="start-from-scratch-btn"
               >
                 {t('Or start with a blank estimate')}
               </button>
             </div>
           )}
        </div>

        {/* Z-10: Recording Immersive Overlay */}
        {isRecording && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
            {/* Live Transcript Top */}
            <div className="flex-1 w-full max-w-md flex flex-col justify-end pb-8">
              {(liveTranscript || interimTranscript) ? (
                <p className="text-foreground/90 text-lg sm:text-xl text-center leading-relaxed whitespace-pre-wrap font-medium">
                  {liveTranscript}
                  {interimTranscript && (
                    <span className="text-muted-foreground">{interimTranscript}</span>
                  )}
                </p>
              ) : (
                <p className="text-muted-foreground/60 italic text-center animate-pulse">
                  {t('Listening...')}
                </p>
              )}
            </div>
            
            {/* Center: Waveform & Timer */}
            <div className="flex flex-col items-center gap-6 shrink-0 mb-[120px]">
               <p className="text-4xl sm:text-5xl font-mono text-foreground tabular-nums tracking-tight font-light">
                 <CaptureTimer elapsedMs={elapsedMs} />
               </p>
               <div className="w-full min-w-[280px]">
                 <WaveformVisualizer analyser={analyser} isRecording={isRecording} height={80} />
               </div>
            </div>
          </div>
        )}

        {/* Z-20: Floating Photo Thumbnails */}
        {photoItems.length > 0 && (
          <div className="absolute bottom-[88px] left-0 right-0 z-20 px-4">
             <PhotoThumbnailGrid items={photoItems} onRemove={onRemovePhoto} />
          </div>
        )}

        {/* Z-30: Glassmorphism Bottom Action Bar */}
        <div className="absolute bottom-4 left-4 right-4 z-30">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPhotoFileChange}
          />
          <div className="rounded-full bg-background/60 backdrop-blur-xl border border-border shadow-lg p-2 flex items-center justify-between gap-2">
            
            {/* Left: Camera */}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-12 w-12 hover:bg-foreground/5 text-muted-foreground hover:text-foreground shrink-0 relative"
              onClick={() => photoInputRef.current?.click()}
              disabled={isUploadingPhotos || photoItems.length >= MAX_PHOTOS}
              data-testid="capture-add-photos"
            >
              {isUploadingPhotos ? <LoadingDots /> : <Camera className="h-6 w-6" />}
              {photoItems.length > 0 && (
                <span className="absolute top-1 right-1 h-4 w-4 bg-primary text-[10px] font-bold text-primary-foreground rounded-full flex items-center justify-center">
                  {photoItems.length}
                </span>
              )}
            </Button>

            {/* Center: FAB Mic */}
            <div className="flex-1 flex justify-center shrink-0">
               <button
                  type="button"
                  onClick={onToggle}
                  className={cn(
                    "h-16 w-16 -mt-6 rounded-full flex items-center justify-center transition-all shadow-xl border-4 border-background",
                    isRecording 
                      ? "bg-red-500 animate-pulse hover:bg-red-600 text-white" 
                      : "gradient-brand text-primary-foreground hover:opacity-90"
                  )}
                  aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                  data-testid="capture-mic"
               >
                  {isRecording ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
               </button>
            </div>

            {/* Right: Generate */}
            <Button
               size="default"
               className="rounded-full h-12 px-5 font-medium shrink-0 bg-primary/90 hover:bg-primary transition-colors text-sm"
               onClick={onGenerate}
               disabled={!hasAnyInput || isRecording}
               data-testid="generate-estimate-btn"
            >
               <span className="hidden sm:inline mr-1">{t('Generate')}</span>
               <span className="sm:hidden mr-1">{t('Gen')}</span>
               <Sparkles className="h-4 w-4" />
            </Button>

          </div>
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
            size="lg"
            className="w-full"
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
