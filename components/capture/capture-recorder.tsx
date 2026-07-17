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
import { CaptureNeedsDetails } from '@/components/capture/capture-needs-details'
import { VoiceRecorder } from '@/components/workspace/audio/voice-recorder'
import { startRecordingPipeline, createTextRecording, reportClientPipelineFailure } from '@/lib/actions/recording'
import { createBlankEstimate } from '@/lib/actions/estimate'
import { createPhoto, deletePhoto } from '@/lib/actions/photo'
import { createClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'
import { uploadWithRetry } from '@/lib/storage/upload-with-retry'
import { savePendingCapture, getPendingCapture, deletePendingCapture, isAvailable as isBlobStoreAvailable, type PendingCapture } from '@/lib/capture/blob-store'
import { getSupportedAudioMimeType, getFileExtension } from '@/lib/utils/media-format'
import { cn } from '@/lib/utils'
import { compressImage, isLikelyHeic } from '@/lib/utils/image-compressor'
import { Camera, Sparkles, Pause, Play } from 'lucide-react'
import { LoadingDots } from '@/components/ui/loading-dots'
import { WaveformVisualizer } from '@/components/workspace/audio/waveform-visualizer'
import type { ProjectDetail } from '@/lib/queries/project'
import type { Photo } from '@/lib/queries/photo'
import { pollEstimateOutcome, getCurrentEstimateId, type EstimateOutcome, type StageProgress } from '@/lib/estimate/poll-outcome'
import { getStepMedians } from '@/lib/actions/attempt-outcome'
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

// CAPT-03: a pending IDB capture older than this is treated as stale and
// silently discarded rather than offered for resume.
const PENDING_CAPTURE_MAX_AGE_MS = 24 * 60 * 60 * 1000

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

// 260707-ru5: pause-aware elapsed clock. `accumulatedMs` is the sum of every
// already-recorded segment; `segmentStartMs` is the performance.now() the
// CURRENT segment started at (null = paused/idle — no live segment to add).
// Pure so it's trivially testable without a real MediaRecorder.
export function computeElapsedMs(accumulatedMs: number, segmentStartMs: number | null, nowMs: number): number {
  return accumulatedMs + (segmentStartMs === null ? 0 : nowMs - segmentStartMs)
}

// Feature gate — MediaRecorder.pause/resume support (missing on some older
// mobile WebViews). SSR-safe: MediaRecorder doesn't exist server-side.
const SUPPORTS_PAUSE =
  typeof window !== 'undefined' &&
  typeof MediaRecorder !== 'undefined' &&
  typeof MediaRecorder.prototype.pause === 'function'

// 260707-lyq (P4 Wave 2): pollJob (hooks/use-job-status.ts) rethrows a signal-abort
// as a plain Error with message 'Aborted' — NOT a DOMException named 'AbortError'.
// pollEstimateOutcome throws a DOMException named 'AbortError'. capture-recorder no
// longer races the two (see below) but pollJob is still used elsewhere in this
// codebase with the same abort convention, so both shapes are checked here —
// harmless/defensive now that only pollEstimateOutcome's abort actually fires from
// this file's call sites.
function isAbortSignal(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null | undefined
  return e?.name === 'AbortError' || e?.message === 'Aborted'
}

type PhotoItemStatus = 'uploading' | 'done' | 'error'
interface PhotoItem {
  id: string                 // client-minted photoId (storage filename source pre-success)
  status: PhotoItemStatus
  previewUrl: string         // object URL for instant thumbnail
  photo?: Photo              // present once status === 'done'
}

type Stage = 'idle' | 'saving' | 'transcribing' | 'analyzing' | 'generating' | 'done'
type StageKey = 'saving' | 'transcribing' | 'analyzing' | 'generating'

// 260707-o7a: journal-derived progress snapshot for the real progress bar
// (CaptureProcessingOverlay). Reset at each dispatch; updated on every
// pending poll tick via handleStageProgress.
interface AttemptProgress {
  completedSteps: string[]
  activeStep: string | null
  activeStepStartedAt: string | null
}
const EMPTY_ATTEMPT_PROGRESS: AttemptProgress = {
  completedSteps: [],
  activeStep: null,
  activeStepStartedAt: null,
}

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
  const [isPaused, setIsPaused] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  // Pipeline state
  const [stage, setStage] = useState<Stage>('idle')
  const [failedAt, setFailedAt] = useState<StageKey | undefined>(undefined)
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
  const [retriesUsed, setRetriesUsed] = useState(0)
  // QUICK-psh-02: classification + specific questions from the vague terminal
  // (projects.needs_details via getAttemptOutcome), rendered as a compact panel
  // instead of the old generic toast. null = no needs_details outcome pending.
  // fallbackMessage is the path-specific vagueMessage (inline t() literal at
  // each handleEstimateOutcome call site) used when reason/questions are absent.
  const [needsDetailsInfo, setNeedsDetailsInfo] = useState<
    { reason?: string; questions?: string[]; fallbackMessage: string } | null
  >(null)

  // Multi-modal input state. Lazy-init from the saved draft (if any) so reopening
  // the popup restores the text the user typed before closing it.
  const [descriptionText, setDescriptionText] = useState(() => readDraft(draftKey))
  const [uploadedPhotos, setUploadedPhotos] = useState<Photo[]>([])
  // Per-photo items (uploading | done | error) drive the thumbnail strip.
  // `uploadedPhotos` stays the pipeline source of truth (only 'done' photos).
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([])
  const isUploadingPhotos = photoItems.some(i => i.status === 'uploading')

  // 260707-o7a: real progress bar state — journal-derived (never advances a
  // segment without its succeeded event) + live step medians fetched ONCE per
  // capture session (not per tick).
  const [attemptProgress, setAttemptProgress] = useState<AttemptProgress>(EMPTY_ATTEMPT_PROGRESS)
  const [stepMedians, setStepMedians] = useState<Record<string, number> | undefined>(undefined)
  // Session-level fetch guard (ref, per plan): the medians read fires once per
  // capture session; the state mirror above exists only so the value flows
  // into CaptureProcessingOverlay's props (a bare ref write wouldn't re-render).
  const stepMediansRequestedRef = useRef(false)
  const ensureStepMedians = useCallback(() => {
    if (stepMediansRequestedRef.current) return
    stepMediansRequestedRef.current = true
    // Best-effort: getStepMedians never throws (falls back internally), but a
    // network-level server-action rejection is still possible — the model's
    // FALLBACK_MEDIANS_MS covers the undefined case.
    void getStepMedians().then(setStepMedians).catch(() => {})
  }, [])

  // Language for the estimate — default from app language (cascade layer 4).
  // Controlled by the parent when props are supplied (popup lifts it into the
  // Dialog header); otherwise managed internally (fullscreen /capture route).
  const [internalEstimateLanguage, setInternalEstimateLanguage] = useState<EstimateLanguage>(
    appLanguage === 'pt' || appLanguage === 'es' ? appLanguage : 'en'
  )
  const estimateLanguage = estimateLanguageProp ?? internalEstimateLanguage
  const setEstimateLanguage = setEstimateLanguageProp ?? setInternalEstimateLanguage

  // CAPT-03: the IndexedDB key for this project/flow's pending (unsent)
  // recording. Prefers draftKey (popup:<id> / edit:<id> / capture:<id> / 'new')
  // so a per-flow resume never bleeds across flows on the same project; falls
  // back to the always-present projectId, then a defensive 'default'.
  const pendingCaptureKey = draftKey ?? projectId ?? 'default'
  // A pending capture found on mount (< 24h old) — renders the inline
  // "Resume upload / Discard" card while idle. null once resolved/discarded/
  // resumed.
  const [pendingResume, setPendingResume] = useState<PendingCapture | null>(null)

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef<string>('')
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // 260707-ru5: pause-aware clock — accumulatedMsRef sums every completed
  // segment; segmentStartRef is the performance.now() the CURRENT segment
  // started at (null while paused/idle — see computeElapsedMs above).
  const accumulatedMsRef = useRef<number>(0)
  const segmentStartRef = useRef<number | null>(null)
  const warnedRef = useRef<boolean>(false)
  const abortControllerRef = useRef<AbortController>(new AbortController())
  const photoInputRef = useRef<HTMLInputElement>(null)
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

  // CAPT-03: mount-time resume scan — a remount (crash, tab close, popup
  // reopen) with a pending capture for this project/flow surfaces a "Resume
  // upload / Discard" card instead of silently losing the recording. Stale
  // entries (>24h) are cleaned up silently rather than offered for resume.
  useEffect(() => {
    let cancelled = false
    void getPendingCapture(pendingCaptureKey).then((stored) => {
      if (cancelled || !stored) return
      if (Date.now() - stored.createdAt > PENDING_CAPTURE_MAX_AGE_MS) {
        void deletePendingCapture(pendingCaptureKey)
        return
      }
      setPendingResume(stored)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCaptureKey])

  // REC-03/REC-04 attempt lineage — REWRITTEN 260707-lyq (P4 Wave 2): attemptId
  // is the stable lineage id (minted ONCE, never reset — even across Retry) so
  // the journal (pipeline_events) can be read as one continuous attempt history.
  // requestId/dispatchNonce are the OPPOSITE: re-minted on every Retry (see
  // onRetry below) so a Retry is a GENUINE re-run — a fresh requestId yields a
  // fresh generate-estimate event id (estimate-${projectId}-${requestId}), and a
  // bumped dispatchNonce folds into the transcribe event id
  // (transcribe-${recordingId}-r${dispatchNonce}) so Inngest creates a brand
  // new run instead of deduping against the original dispatch. (Previously
  // requestId was reused across Retry for Inngest-level dedup — that made the
  // Retry button a no-op once transcribe-audio.ts's function-level idempotency
  // was removed in 260707-lyq Wave 1; see lib/actions/recording.ts.)
  // recordingIdRef still holds the recording row id so a Retry reuses the same
  // row (skip re-upload) — only the DISPATCH gets a new id, not the audio file.
  const attemptIdRef = useRef<string | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const recordingIdRef = useRef<string | null>(null)
  // 260707-lyq (P4 Wave 2): retry ordinal, folded into the re-dispatched
  // transcribe event id (see lib/actions/recording.ts's dispatchNonce param).
  // Bumped on every Retry click; text/photos retries don't need it (their
  // event ids derive from requestId alone — see onRetry below).
  const dispatchNonceRef = useRef(0)
  // 260707-hhp (P1 client half): dispatch-and-watch outcome baseline. `undefined`
  // means "not yet captured this attempt" (a distinct sentinel from a real `null`,
  // which means "no current estimate exists yet"). Captured ONCE per attempt
  // (before the first dispatch) and deliberately NOT re-read on Retry — a
  // half-finished first try's estimate must still count as NEW.
  const previousEstimateIdRef = useRef<string | null | undefined>(undefined)

  // Mint the attempt lineage once; a Retry nulls requestIdRef first (see
  // onRetry below) so this re-mints ONLY requestId — attemptIdRef is never
  // reset, preserving the lineage across retries.
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

  // Stop recording (memoized for use in callbacks). Valid from both
  // 'recording' and 'paused' MediaRecorder states — state !== 'inactive'
  // covers both.
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Snapshot the final wall-clock BEFORE .stop() — recorder.onstop reads
      // elapsedMsRef (not the elapsedMs state closure) via runPipelineRef (260707-grq).
      // computeElapsedMs handles both a live segment (segmentStartRef set) and
      // a paused stop (segmentStartRef null — accumulated is already final).
      elapsedMsRef.current = computeElapsedMs(accumulatedMsRef.current, segmentStartRef.current, performance.now())
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
    setIsPaused(false)
    // Flip stage synchronously so React never paints an interim frame with
    // stage='idle' && isRecording=false (which would re-show the recorder UI).
    // runPipeline() will also call setStage('saving') from the async onstop
    // handler — that's idempotent. The functional guard preserves the current
    // stage if a retry / fullscreen path has already advanced past 'idle'.
    setStage((s) => s === 'idle' ? 'saving' : s)
  }, [])

  // Pause recording — 260707-ru5. Accumulates the just-finished segment,
  // clears segmentStartRef (freezing computeElapsedMs), and calls the native
  // MediaRecorder.pause() (no dataavailable fires while paused). Deliberately
  // does NOT touch stream/tracks/AudioContext — the permission-revoked guard
  // (mute/inactive listener above) needs the track to stay alive during pause.
  const pauseRecording = useCallback(() => {
    const rec = mediaRecorderRef.current
    if (!rec || rec.state !== 'recording') return
    const now = performance.now()
    accumulatedMsRef.current = computeElapsedMs(accumulatedMsRef.current, segmentStartRef.current, now)
    segmentStartRef.current = null
    elapsedMsRef.current = accumulatedMsRef.current
    setElapsedMs(accumulatedMsRef.current)
    rec.pause()
    setIsPaused(true)
  }, [])

  // Resume recording — 260707-ru5. Starts a fresh segment; idempotent via
  // rec.state (a stray double-click while already recording is a no-op).
  const resumeRecording = useCallback(() => {
    const rec = mediaRecorderRef.current
    if (!rec || rec.state !== 'paused') return
    rec.resume()
    segmentStartRef.current = performance.now()
    setIsPaused(false)
  }, [])

  // Tick — wall-clock elapsed (RESEARCH Pattern 4). computeElapsedMs freezes
  // the value while paused (segmentStartRef null) — thresholds below therefore
  // only ever count actually-recorded time (260707-ru5).
  const tick = useCallback(() => {
    const elapsed = computeElapsedMs(accumulatedMsRef.current, segmentStartRef.current, performance.now())
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

  // Prevent accidental navigation during the ENTIRE capture-to-dispatch
  // window (audit F2 — the old guard was `isRecording` only, which flips
  // false the instant the recording stops and the upload begins). Gated on
  // STAGE STATE, not refs (Opus check #5: there is no jobId state, and
  // recordingIdRef is audio-only + non-reactive, so it can't drive an effect
  // dependency). 'saving' alone already covers the full upload+dispatch-call
  // window for every input type (audio/text/photos all pass through 'saving'
  // before their dispatch resolves). The extra 'transcribing' +
  // recordingIdRef-null check is audio-only defensive belt-and-braces: in
  // practice recordingIdRef.current is written in the SAME synchronous block
  // that flips stage to 'transcribing' (see runPipeline, just above its
  // setStage('transcribing') call), so that branch is unreachable today —
  // reading the ref INSIDE the handler (not captured at effect-setup time)
  // keeps it race-free if that ordering ever changes. After dispatch is
  // confirmed the server owns the chain end-to-end (audit-verified
  // dispatch-and-watch durability) — no warning needed past that point.
  useEffect(() => {
    if (!isRecording && stage !== 'saving' && stage !== 'transcribing') return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const preDispatchAudio = stage === 'transcribing' && recordingIdRef.current === null
      if (isRecording || stage === 'saving' || preDispatchAudio) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isRecording, stage])

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

  // Revoke all photo preview object URLs on unmount (no leaks).
  useEffect(() => () => {
    for (const it of photoItemsRef.current) URL.revokeObjectURL(it.previewUrl)
  }, [])

  // Pipeline helper: set failure state + best-effort client-side telemetry so a failure
  // in the CLIENT leg of the pipeline is still visible in /admin/events (260707-grq).
  // useCallback (dep: projectId only — audioBlob/uploadedPhotos/attemptId are read via
  // refs above) keeps this referentially stable so the callers' manual dependency
  // arrays (which list `failAt`) don't get recreated on every render.
  // 260707-lyq (P4 Wave 2): `skipReport` — a journal-sourced failure (the new
  // 'failed' EstimateOutcome) already has a durable pipeline_events row (the
  // server recorded it); calling reportClientPipelineFailure for it too would
  // double-report the same failure under a synthetic 'client_reported' code.
  const failAt = useCallback((s: StageKey, msg: string, opts?: { skipReport?: boolean }) => {
    setFailedAt(s)
    setErrorMessage(msg)
    if (opts?.skipReport) return
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

  // 260707-lyq (P4 Wave 2): inverse of failAt's stepMap — maps a journal
  // failure's `step` (pipeline_events enum) back onto the UI's StageKey so
  // failAt highlights the stage that actually failed. Defaults to 'generating'
  // for any step outside the known 4 (defensive; every journaled step in this
  // pipeline is one of these).
  const stepToStageKey = useCallback((step: string): StageKey => {
    switch (step) {
      case 'save_recording': return 'saving'
      case 'transcribe': return 'transcribing'
      case 'analyze': return 'analyzing'
      default: return 'generating' // generate_estimate + defensive fallback
    }
  }, [])

  // 260707-lyq (P4 Wave 2): journal-driven stage progression — fires on every
  // pollEstimateOutcome tick where the journal read came back `pending`.
  // Replaces the old per-path recordingId/transcript (or analyze-job-completed)
  // polling: stage progression now comes entirely from the journal, matching
  // every path's actual server-side pipeline order.
  // 260707-o7a: also stores the journal-derived progress snapshot for the real
  // progress bar. The active step is lastStep ONLY when the journal hasn't
  // confirmed it succeeded — a bar segment can therefore never advance (or
  // fill past ACTIVE_FILL_CAP) without its journal succeeded event.
  const handleStageProgress = useCallback((progress: StageProgress) => {
    if (progress.lastStep === 'save_recording') setStage('transcribing')
    else if (progress.lastStep === 'transcribe' || progress.lastStep === 'analyze') setStage('generating')
    setAttemptProgress({
      completedSteps: progress.completedSteps,
      activeStep:
        progress.lastStep && !progress.completedSteps.includes(progress.lastStep)
          ? progress.lastStep
          : null,
      activeStepStartedAt: progress.activeStepStartedAt,
    })
  }, [])

  // 260707-hhp (P1 client half): shared outcome handling for all three
  // dispatch-and-watch paths (audio/text/photos) — completed → done/onComplete;
  // awaiting_details → the path-specific vague toast + full attempt reset;
  // 260707-lyq (P4 Wave 2): failed → the journal's REAL error, surfaced via
  // failAt (stage-mapped, report suppressed — the journal already has it);
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
      // QUICK-psh-02: a compact panel (CaptureNeedsDetails) replaces the old
      // generic toast — reason/questions come from projects.needs_details
      // (absent → the panel falls back to the plain vagueMessage). The same
      // reset side-effects run immediately; the panel's "Record again" button
      // (handleNeedsDetailsRecordAgain) is what actually reveals the recorder
      // UI again (stage stays as-is here so the panel has somewhere to render).
      setNeedsDetailsInfo({
        reason: outcome.reason,
        questions: outcome.questions,
        fallbackMessage: vagueMessage,
      })
      setAudioBlob(null)
      recordingIdRef.current = null
      attemptIdRef.current = null
      requestIdRef.current = null
      previousEstimateIdRef.current = undefined
      setAttemptProgress(EMPTY_ATTEMPT_PROGRESS)
      return
    }
    if (outcome.state === 'failed') {
      // 260707-lyq (P4 Wave 2): journal-sourced failure — the server's REAL
      // error_message, surfaced within ~1 tick instead of the 6-minute
      // timeout. skipReport: true — the journal already has this failure
      // (the server wrote it), so failAt must not double-report it.
      failAt(stepToStageKey(outcome.step), outcome.reason, { skipReport: true })
      return
    }
    // timeout
    failAt('generating', t('Generation is taking longer than expected. It may still complete in the background — check the project in a minute, or retry.'))
  }, [onComplete, projectId, router, t, failAt, stepToStageKey])

  // QUICK-psh-02: the needs-details panel's "Record again" action — dismisses
  // the panel and reveals the (already-reset) recorder UI.
  const handleNeedsDetailsRecordAgain = useCallback(() => {
    setNeedsDetailsInfo(null)
    setStage('idle')
  }, [])

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
        // CAPT-01: retry wrapper (3 tries, exponential backoff) — self-heals a
        // transient network flap or 5xx instead of failing the whole photo on
        // the first blip. Error surface is unchanged (flip('error') is the
        // same outcome as before for a genuinely terminal failure).
        await uploadWithRetry(storage, 'photos', storagePath, blob, { contentType: 'image/jpeg', upsert: false })
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
  // dispatches the transcribe→generate chain; the client then only WATCHES for
  // the outcome via pollEstimateOutcome. 260707-lyq (P4 Wave 2): the poll is now
  // journal-first (attemptId) — the old pollJob fast-failure race helper is
  // REMOVED entirely; the journal surfaces a real failure within ~1 tick,
  // making that race redundant.
  const runPipeline = useCallback(async (blob: Blob) => {
    abortControllerRef.current = new AbortController()
    setStage('saving')
    setFailedAt(undefined)
    setErrorMessage(undefined)
    // QUICK-psh-02: a fresh dispatch must not show a stale needs-details panel
    // from a prior discarded attempt.
    setNeedsDetailsInfo(null)
    // 260707-o7a: fresh dispatch — clear the progress snapshot (a Retry must
    // not show the previous run's segments) + kick the one-per-session
    // medians fetch (non-blocking).
    setAttemptProgress(EMPTY_ATTEMPT_PROGRESS)
    ensureStepMedians()

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
        // CAPT-01: retry wrapper (3 tries, exponential backoff 1s/2s/4s,
        // retry only on network/5xx — never on 4xx/quota). Error surface is
        // unchanged: failAt fires exactly as before once retries exhaust.
        await uploadWithRetry(createStorage(createClient()), 'audio', storagePath, blob, {
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
      // 260707-lyq (P4 Wave 2): 0 on the FIRST dispatch (legacy event-id
      // format); Retry bumps this ref before calling runPipeline again.
      dispatchNonce: dispatchNonceRef.current,
    })
    if ('error' in started) {
      failAt('saving', started.error ?? t('Failed to save recording'))
      return
    }
    recordingIdRef.current = started.data.recordingId
    // CAPT-03: dispatch confirmed (the server has the recording row + the
    // transcribe→generate chain dispatched) — the IDB-persisted blob has
    // served its purpose. Fire-and-forget: blob-store never throws, and a
    // slow delete must not delay the stage transition below. Do NOT delete
    // on a transient upload/dispatch failure above (return before this line)
    // — that's exactly the resume case this feature protects.
    void deletePendingCapture(pendingCaptureKey)

    setStage('transcribing')
    try {
      const outcome = await pollEstimateOutcome({
        projectId,
        previousEstimateId: previousEstimateIdRef.current ?? null,
        signal: abortControllerRef.current.signal,
        attemptId: attemptIdRef.current ?? undefined,
        onStageProgress: handleStageProgress,
      })

      handleEstimateOutcome(
        outcome,
        t('Description too vague — please record again with specific tasks, materials, and quantities')
      )
    } catch (err) {
      if (isAbortSignal(err)) return  // unmount; not a user-facing failure
      failAt('generating', (err as Error).message ?? t('Estimate generation failed'))
    }
  }, [companyId, projectId, estimateLanguage, ensureAttempt, captureOutcomeBaseline, handleStageProgress, ensureStepMedians, t, failAt, handleEstimateOutcome, pendingCaptureKey])

  // Mirror the latest runPipeline closure into a ref — recorder.onstop is bound
  // ONCE at recording start and must invoke the LATEST closure (fresh
  // estimateLanguage/onComplete/elapsed refs), not the one captured at start (260707-grq).
  useEffect(() => { runPipelineRef.current = runPipeline }, [runPipeline])

  // CAPT-03: resume a pending capture found on mount. A fresh remount resets
  // every ref runPipeline depends on (Opus blocker #2) — seed them BEFORE
  // invoking runPipeline so its min-duration guard (:826 above) doesn't
  // reject the reconstructed blob, and so the storagePath extension/
  // contentType aren't mislabeled (e.g. iOS audio/mp4 read as webm).
  // setAudioBlob is also seeded so a subsequent manual Retry (CaptureFailure)
  // still has input to re-run.
  const handleResumeCapture = useCallback(() => {
    if (!pendingResume) return
    const stored = pendingResume
    setPendingResume(null)
    const reconstructed = new Blob([stored.buffer], { type: stored.mimeType })
    elapsedMsRef.current = stored.durationSeconds * 1000
    accumulatedMsRef.current = stored.durationSeconds * 1000
    mimeTypeRef.current = stored.mimeType
    setAudioBlob(reconstructed)
    void runPipeline(reconstructed)
  }, [pendingResume, runPipeline])

  const handleDiscardCapture = useCallback(() => {
    setPendingResume(null)
    void deletePendingCapture(pendingCaptureKey)
  }, [pendingCaptureKey])

  // Unified generation handler (text-only, audio, or photos-only)
  const handleGenerate = useCallback(async () => {
    abortControllerRef.current = new AbortController()
    setFailedAt(undefined)
    setErrorMessage(undefined)
    // QUICK-psh-02: a fresh dispatch must not show a stale needs-details panel
    // from a prior discarded attempt.
    setNeedsDetailsInfo(null)
    // 260707-o7a: fresh dispatch — clear the progress snapshot + kick the
    // one-per-session medians fetch (non-blocking). The audio branch below
    // (runPipeline) repeats both harmlessly (idempotent).
    setAttemptProgress(EMPTY_ATTEMPT_PROGRESS)
    ensureStepMedians()
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
          attemptId: attemptIdRef.current ?? undefined,
          onStageProgress: handleStageProgress,
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
      // Plan 01) then watch the journal. 260707-lyq (P4 Wave 2): the old
      // pollJob(analyzeJobId) race is REMOVED — stage progression (analyzing →
      // generating) and failure detection both come from onStageProgress /
      // the journal-first outcome poll now.
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

        const outcome = await pollEstimateOutcome({
          projectId,
          previousEstimateId: previousEstimateIdRef.current ?? null,
          signal: abortControllerRef.current.signal,
          attemptId: attemptIdRef.current ?? undefined,
          onStageProgress: handleStageProgress,
        })

        handleEstimateOutcome(
          outcome,
          t('Photos too vague — please add a voice description or more detailed photos')
        )
      } catch (err) {
        if (isAbortSignal(err)) return
        failAt('analyzing', (err as Error).message ?? t('Estimate generation failed'))
      }
    }
  }, [descriptionText, audioBlob, uploadedPhotos, projectId, runPipeline, estimateLanguage, t, ensureAttempt, captureOutcomeBaseline, handleStageProgress, ensureStepMedians, failAt, handleEstimateOutcome])

  // Start recording
  const startRecording = useCallback(async () => {
    chunksRef.current = []
    setElapsedMs(0)
    elapsedMsRef.current = 0
    accumulatedMsRef.current = 0
    setIsPaused(false)
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
        // CAPT-03: initiate the IndexedDB persist BEFORE starting the upload
        // below — a finished recording now survives a crash/close during the
        // 40s-2min upload window (audit F1/F3). Fire-and-forget: onstop is
        // synchronous and this must never block/delay the pipeline dispatch.
        // "Persist before upload" is initiation ORDER only, not a
        // happens-before guarantee (Opus check #6) — blob.arrayBuffer() and
        // the IDB write are both async, so on a very fast network the upload
        // could in theory land first. That's acceptable: this fix targets the
        // large "slow network" failure window, not a guaranteed race outcome.
        // isAvailable() memo skips the (potentially large) arrayBuffer()
        // conversion entirely when IDB isn't on the global at all — no point
        // doing that work just to have savePendingCapture fail-soft anyway.
        if (isBlobStoreAvailable()) {
          const durationSecondsAtStop = finalizeDurationSeconds(elapsedMsRef.current)
          const mimeTypeAtStop = recorder.mimeType || mimeTypeRef.current
          void blob.arrayBuffer()
            .then((buffer) =>
              savePendingCapture({
                key: pendingCaptureKey,
                buffer,
                mimeType: mimeTypeAtStop,
                durationSeconds: durationSecondsAtStop,
                createdAt: Date.now(),
              })
            )
            .catch((err) => console.error('[capture] IDB persist failed (non-fatal):', err))
        }
        // Pipeline fires after blob is set — call through runPipelineRef so the
        // LATEST closure runs at stop, not the one bound when onstop was assigned
        // at recording start (260707-grq: root cause of the duration=0 bug).
        void runPipelineRef.current(blob)
      }

      recorder.start()
      segmentStartRef.current = performance.now()
      setIsRecording(true)

      tickIntervalRef.current = setInterval(tick, TICK_MS)
      // 260707-o7a: the Web Speech API live caption was REMOVED entirely — it
      // cannot handle multilingual code-switching (showed English for
      // Portuguese speech). Whisper (server-side, multilingual auto-detect)
      // is the only transcription; recording shows waveform + timer only.
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

  // 260707-lyq (P4 Wave 2): Real Retry — re-mints requestId (fresh event ids)
  // and bumps dispatchNonce (audio's transcribe re-dispatch) while leaving
  // attemptIdRef untouched (stable lineage) and previousEstimateIdRef untouched
  // (a half-finished first try's estimate must still count as NEW; see the ref
  // comment above). attemptId is NOT re-minted — ensureAttempt() only fills in
  // the now-null requestId. Text/photos retries don't need a nonce: a fresh
  // requestId alone already yields new estimate-/analyze- event ids (both
  // derive their Inngest event id from requestId, not a recordingId).
  const handleRetry = useCallback(() => {
    setRetriesUsed(r => r + 1)
    dispatchNonceRef.current += 1
    requestIdRef.current = null
    ensureAttempt()
    if (audioBlob) {
      runPipeline(audioBlob)
    } else {
      handleGenerate()
    }
  }, [audioBlob, ensureAttempt, runPipeline, handleGenerate])

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
        <>
          {/* CAPT-03: an unsent recording found on mount (crash, tab close,
              popup reopen) for this project/flow — Resume re-runs the
              pipeline with the reconstructed blob; Discard drops it from IDB. */}
          {pendingResume && (
            <div
              className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm"
              data-testid="capture-resume-card"
            >
              <span className="text-amber-900 dark:text-amber-200">
                {t('You have an unsent recording')} ({Math.max(1, Math.round(pendingResume.durationSeconds / 60))} {t('min')})
              </span>
              <div className="flex gap-2 shrink-0">
                <Button variant="ghost" size="sm" onClick={handleDiscardCapture} data-testid="capture-resume-discard">
                  {t('Discard')}
                </Button>
                <Button size="sm" onClick={handleResumeCapture} data-testid="capture-resume-upload">
                  {t('Resume upload')}
                </Button>
              </div>
            </div>
          )}
          <RecorderBody
            analyser={analyser}
            isRecording={isRecording}
            isPaused={isPaused}
            elapsedMs={elapsedMs}
            ringColorClass={ringColorClass}
            progress={progress}
            onToggle={handleToggleRecording}
            onPause={isPaused ? resumeRecording : pauseRecording}
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
            // Horizontal layout: popup with no mode lock
            isHorizontal={isPopup && mode === undefined}
            onStartBlank={onStartBlank}
          />
        </>
      ) : isPopup ? (
        // Popup variant — calm three-blue-dots overlay over a neutral surface.
        // `relative` provides the positioning context for the absolutely-positioned
        // overlay; `min-h-[260px]` ensures the overlay has visible space even on
        // short content (the parent Dialog already constrains max-height).
        <div className="relative flex-1 min-h-[260px]">
          {/* 260707-o7a: real journal-driven progress — segments only advance on
              journal succeeded events (attemptProgress via handleStageProgress);
              medians make the in-segment fill an honest elapsed-vs-typical read. */}
          {!failedAt && !needsDetailsInfo && (
            <CaptureProcessingOverlay
              stage={stage}
              mode={activeMode}
              completedSteps={attemptProgress.completedSteps}
              activeStep={attemptProgress.activeStep}
              activeStepStartedAt={attemptProgress.activeStepStartedAt}
              medians={stepMedians}
            />
          )}
          {failedAt && (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="w-full max-w-md">
                <CaptureFailure
                  errorMessage={errorMessage ?? t('Something went wrong')}
                  retriesUsed={retriesUsed}
                  onRetry={hasAnyInput ? handleRetry : undefined}
                  onEditManually={handleEditManually}
                />
              </div>
            </div>
          )}
          {/* QUICK-psh-02: needs-details panel — mutually exclusive with the
              overlay/failure surfaces above (failedAt never coincides with a
              needs_details outcome). */}
          {!failedAt && needsDetailsInfo && (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="w-full max-w-md">
                <CaptureNeedsDetails
                  reason={needsDetailsInfo.reason}
                  questions={needsDetailsInfo.questions}
                  fallbackMessage={needsDetailsInfo.fallbackMessage}
                  onRecordAgain={handleNeedsDetailsRecordAgain}
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
                the transcript text client-side (only a journal-driven stage-progression
                signal, see handleStageProgress) — the mid-generation transcript preview
                is dropped. */}
            <CaptureStepper currentStage={stage} failedAt={failedAt} mode={activeMode} />
            {failedAt && (
              <CaptureFailure
                errorMessage={errorMessage ?? t('Something went wrong')}
                retriesUsed={retriesUsed}
                onRetry={hasAnyInput ? handleRetry : undefined}
                onEditManually={handleEditManually}
              />
            )}
            {/* QUICK-psh-02: needs-details panel (legacy fullscreen route). */}
            {!failedAt && needsDetailsInfo && (
              <CaptureNeedsDetails
                reason={needsDetailsInfo.reason}
                questions={needsDetailsInfo.questions}
                fallbackMessage={needsDetailsInfo.fallbackMessage}
                onRecordAgain={handleNeedsDetailsRecordAgain}
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
  // 260707-ru5: pause state (popup-only feature — see onPause below)
  isPaused: boolean
  elapsedMs: number
  ringColorClass: string
  progress: number
  onToggle: () => void
  // 260707-ru5: toggles pause/resume — resumeRecording when isPaused, else
  // pauseRecording. Only rendered (isHorizontal FAB bar) when SUPPORTS_PAUSE.
  onPause: () => void
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
  // Horizontal 2-column layout (popup + unified mode)
  isHorizontal: boolean
  onStartBlank?: () => Promise<void>
}

function RecorderBody({ analyser, isRecording, isPaused, elapsedMs, ringColorClass, progress, onToggle, onPause, descriptionText, setDescriptionText, uploadedPhotos, isUploadingPhotos, photoItems, onRemovePhoto, photoInputRef, onPhotoFileChange, hasAnyInput, onGenerate, estimateLanguage, setEstimateLanguage, mode, isHorizontal, onStartBlank }: RecorderBodyProps) {
  const { t } = useTranslation()

  // Unified layout — responsive: stacked on mobile, 2-column on sm+
  if (isHorizontal) {
    // For the mobile popup redesign: immersive glassmorphism layout
    return (
      <div className="flex flex-col flex-1 min-h-[380px] relative overflow-hidden bg-background">

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

        {/* Z-10: Recording Immersive Overlay — 260707-ru5: the recording screen
            and the idle canvas are ONE surface, not a separate layer. Same
            bg-background as the idle textarea (no extra backdrop-blur/opacity
            "other screen" read); the glass action bar (z-30 below) is the
            shared visual anchor across both states. */}
        {isRecording && (
          <div
            className={cn(
              'absolute inset-0 z-10 flex flex-col items-center overflow-hidden bg-background animate-in fade-in duration-300 px-6 pt-6',
              // Bottom padding clears the floating action bar (and the photo
              // strip when present) INSIDE the flex layout — the old
              // mb-[120px] + justify-center pushed content past the container
              // edges and "Listening..." bled out above the dialog.
              photoItems.length > 0 ? 'pb-[196px]' : 'pb-[120px]'
            )}
          >
            {/* Ambient brand glow behind the waveform — depth without shapes. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-64 bg-[radial-gradient(ellipse_at_bottom,hsl(var(--primary)/0.10),transparent_65%)]"
            />

            {/* Status pill — 260707-o7a: no live caption (transcription is
                Whisper, server-side); a REC-style pill replaces the dated
                pulsing italic line. Paused reads as static amber. */}
            <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-end pb-6">
              <div
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em]',
                  isPaused
                    ? 'border-amber-500/25 bg-amber-500/10 text-amber-500'
                    : 'border-red-500/20 bg-red-500/10 text-red-500'
                )}
              >
                <span className="relative flex h-1.5 w-1.5">
                  {!isPaused && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70 motion-reduce:hidden" />
                  )}
                  <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', isPaused ? 'bg-amber-500' : 'bg-red-500')} />
                </span>
                {isPaused ? t('Paused') : t('Listening...')}
              </div>
            </div>

            {/* Timer + waveform pinned just above the action bar. CaptureTimer
                is rendered directly (no nested <p>); paused dims it. */}
            <div className="w-full max-w-md shrink-0 flex flex-col items-center gap-5">
              <CaptureTimer elapsedMs={elapsedMs} className={cn(isPaused && 'text-muted-foreground')} />
              <div className="w-full">
                <WaveformVisualizer analyser={analyser} isRecording={isRecording && !isPaused} height={72} />
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
            
            {/* Left: Camera when idle. During recording, when SUPPORTS_PAUSE
                is available, the SAME footprint (h-12 w-12 rounded-full)
                becomes the Pause/Resume control — no reflow of the bar's
                geometry. Without pause support, Camera stays as-is (the
                pre-existing binary UX). */}
            {isRecording && SUPPORTS_PAUSE ? (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-12 w-12 hover:bg-foreground/5 text-muted-foreground hover:text-foreground shrink-0"
                onClick={onPause}
                aria-label={isPaused ? t('Resume recording') : t('Pause recording')}
                data-testid="capture-pause"
              >
                {isPaused ? <Play className="h-6 w-6 fill-current" /> : <Pause className="h-6 w-6 fill-current" />}
              </Button>
            ) : (
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
            )}

            {/* Center: FAB — glass+REC-dot idle / gradient-danger stop+halo
                recording / same stop dimmed (no halo) while paused. Replaces
                the dated animate-pulse mic icon with a classic REC button. */}
            <div className="flex-1 flex justify-center shrink-0">
               <button
                  type="button"
                  onClick={onToggle}
                  className={cn(
                    "h-16 w-16 -mt-6 rounded-full flex items-center justify-center transition-all shadow-xl border-4 border-background",
                    isRecording
                      ? cn("gradient-danger text-white relative", isPaused && "opacity-80")
                      : "bg-background/80 backdrop-blur-xl ring-1 ring-border hover:bg-background group"
                  )}
                  aria-label={isRecording ? t('Stop recording') : t('Start recording')}
                  data-testid="capture-mic"
               >
                  {isRecording ? (
                    <>
                      {!isPaused && (
                        <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping motion-reduce:hidden" />
                      )}
                      <span className="h-6 w-6 rounded-[6px] bg-white" />
                    </>
                  ) : (
                    <span className="h-7 w-7 rounded-full gradient-danger shadow-[0_0_16px_rgba(239,68,68,0.35)] transition-transform group-hover:scale-110" />
                  )}
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
               <span className="mr-1">{t('Generate')}</span>
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
