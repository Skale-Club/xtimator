'use client'

import { useState, useRef, useCallback, useEffect, useLayoutEffect, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CaptureTimer } from '@/components/capture/capture-timer'
import { CaptureProcessingOverlay } from '@/components/capture/capture-processing-overlay'
import { CaptureFailure } from '@/components/capture/capture-failure'
import { CaptureNeedsDetails } from '@/components/capture/capture-needs-details'
import { CapturePaused } from '@/components/capture/capture-paused'
import { VoiceRecorder } from '@/components/workspace/audio/voice-recorder'
import { startRecordingPipeline, createTextRecording, reportClientPipelineFailure } from '@/lib/actions/recording'
import { createBlankEstimate } from '@/lib/actions/estimate'
import { showBillingBlockToast } from '@/lib/billing/block-toast'
import { isBillingBlockCode, type BillingBlockCode } from '@/lib/billing/block-codes'
import { uploadProjectPhoto, deletePhoto } from '@/lib/actions/photo'
import { createClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'
import { uploadViaTicket } from '@/lib/storage/browser-upload'
import { savePendingCapture, getPendingCapture, deletePendingCapture, isAvailable as isBlobStoreAvailable, type PendingCapture } from '@/lib/capture/blob-store'
import { getSupportedAudioMimeType, formatDuration } from '@/lib/utils/media-format'
import { cn } from '@/lib/utils'
import { compressImage, isLikelyHeic } from '@/lib/utils/image-compressor'
import { Camera, Loader2, Mic, Plus, Sparkles, Pause, Play, Square, Trash2 } from 'lucide-react'
import { LoadingDots } from '@/components/ui/loading-dots'
import { WaveformVisualizer } from '@/components/workspace/audio/waveform-visualizer'
import type { ProjectDetail } from '@/lib/queries/project'
import type { Photo } from '@/lib/queries/photo'
import { pollEstimateOutcome, getCurrentEstimateId, type EstimateOutcome, type StageProgress } from '@/lib/estimate/poll-outcome'
import type { GeneratePhaseVisit } from '@/lib/estimate/generation-phases'
import type { StepTiming } from '@/lib/estimate/progress-model'
import { getStepMedians } from '@/lib/actions/attempt-outcome'
import { useTranslation } from '@/lib/i18n/use-translation'
import { skippedPhotosLine } from '@/lib/estimate/photos/skipped-photos-line'
import { useAppLanguage, useLanguage } from '@/lib/i18n/language-context'
import { useWakeLock } from '@/hooks/use-wake-lock'
import {
  addBackgroundGeneration,
  removeBackgroundGeneration,
  type BackgroundGeneration,
} from '@/lib/estimate/background-generations'
import { isPlaceholderName } from '@/lib/constants/project'
import { canOfferPushNow, enableBrowserPush } from '@/lib/notifications/push-client'
import { EstimateLanguageSelector } from '@/components/estimate/estimate-language-selector'
import { useRefineFlow } from '@/components/capture/use-refine-flow'
import { RefineReview } from '@/components/capture/refine-review'
import { RefineWorking } from '@/components/capture/refine-working'
import { RefineQuestions, answeredCount, composeRefineInstruction, type RefineQuestionsProps } from '@/components/capture/refine-questions'
import { getRefineEditor } from '@/lib/estimate/refine-bridge'
import { readCapturePrompts } from '@/lib/estimate/capture-prompts'
import { openQuestions as openReviewQuestions, readResolvedQuestions, resolveQuestions } from '@/lib/estimate/review-state'
import { BuyCreditsInline } from '@/components/billing/buy-credits'
import { REFINE_MAX_PHOTOS } from '@/lib/capture/refine-client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { type EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { CaptureMode } from '@/components/projects/estimate-creation-popup'

// Duration constants — D-06, D-07
export const HARD_CAP_MS  = 10 * 60 * 1000   // 600000  D-06 — auto-stop
export const WARN_AT_MS   =  9 * 60 * 1000   // 540000  D-07 — 60s remaining
export const AMBER_AT_MS  =  8 * 60 * 1000   // 480000  D-07 — neutral→amber
export const RED_AT_MS    =  9.5 * 60 * 1000 // 570000  D-07 — amber→red
const TICK_MS = 250                            // RESEARCH Pattern 4

/**
 * CAPT-01 self-heal, adapted for the server-action upload path: retries a
 * transient failure (network flap / 5xx) up to 3x with exponential backoff
 * before surfacing an error, same intent as lib/storage/upload-with-retry.ts
 * (which this replaces for photos — that helper is typed against
 * StorageProvider.upload directly and can't wrap a server action).
 */
async function uploadProjectPhotoWithRetry(
  projectId: string,
  formData: FormData,
  sortOrder: number,
  attempts = 3,
  baseDelayMs = 1000
): ReturnType<typeof uploadProjectPhoto> {
  let last: Awaited<ReturnType<typeof uploadProjectPhoto>> | undefined
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await uploadProjectPhoto(projectId, formData, sortOrder)
    if (!('error' in result)) return result
    last = result
    if (attempt < attempts) await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)))
  }
  return last!
}

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
  incoming: number,
  max: number = MAX_PHOTOS
): { take: number; overflowed: boolean } {
  const remaining = Math.max(0, max - currentCount)
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

/**
 * What recorder.onstop should do with a finished take. Pure so the discard rule
 * is testable without a real MediaRecorder: a discarded take must never reach
 * the pipeline, IndexedDB or the "too short" toast.
 */
export type RecorderStopAction = 'discard' | 'too-short' | 'keep-for-refine' | 'run-pipeline'
export function resolveRecorderStop(opts: {
  discarded: boolean
  refineMode: boolean
  blobSize: number
  elapsedMs: number
}): RecorderStopAction {
  if (opts.discarded) return 'discard'
  if (opts.refineMode) {
    return opts.blobSize === 0 || opts.elapsedMs < MIN_RECORDING_MS ? 'too-short' : 'keep-for-refine'
  }
  return 'run-pipeline'
}

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
  blob?: Blob                // refine mode: the compressed image, sent with the refine request (never uploaded)
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
  /**
   * Phase 168 (PHOTO-02 UI half): analyze-step coverage counts forwarded from
   * the journal (168-01's analyze-photos.ts metadata, via poll-outcome's
   * StageProgress) — absent for non-photo capture modes or before the
   * analyze step's succeeded event lands.
   */
  analyzedCount?: number
  totalCount?: number
  failedCount?: number
  /** 260927: per-step first-started / first-succeeded timestamps (checklist durations). */
  stepTimings?: StepTiming[]
  /** 260927: every generate sub-phase visit so far (checklist rows + their facts). */
  phaseVisits?: GeneratePhaseVisit[]
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
  /** Resolves false when the blank estimate could not be created (the caller already toasted). */
  onStartBlank?: () => Promise<boolean | void>
  /**
   * Edit-with-AI REFINE mode. When set (the project already has a current
   * estimate) the typed text / voice note / photos are sent to
   * POST /api/estimates/[id]/refine, reviewed, then applied to that estimate.
   * Nothing is written to `recordings` and generate-estimate is never called
   * (except the explicit "Regenerate from scratch" action). When omitted the
   * recorder generates a new estimate exactly as before.
   */
  refineEstimateId?: string
  /** Refine mode: close the popup (after Apply into a mounted editor, or Discard). */
  onRefineDone?: () => void
  /** Text seeded into the description box once (e.g. "Answer with AI"). */
  initialText?: string
}

export function CaptureRecorder({
  project,
  // Phase 189 Plan 03 (UPLOAD-01): companyId is no longer read on this
  // component's upload path — the server derives the storage key from the
  // authenticated caller's active company, not from a client-supplied prop.
  // Kept in CaptureRecorderProps (parent still passes it; removing the prop
  // would ripple into callers and is not this phase's business), but no
  // longer destructured here since nothing in this file reads it now.
  projectId,
  variant = 'fullscreen',
  mode,
  onComplete,
  // onCancel: after the 260525-wdj fix, "Edit manually" always pushes to
  // /projects/{projectId} via router.push, and the popup chrome (Dialog
  // onOpenChange) owns the X/overlay close path. 260927: the recorder calls it
  // for "Continue in the background", to close the popup it lives in.
  onCancel,
  estimateLanguage: estimateLanguageProp,
  setEstimateLanguage: setEstimateLanguageProp,
  draftKey,
  restorePhotos = false,
  onStartBlank,
  refineEstimateId,
  onRefineDone,
  initialText,
}: CaptureRecorderProps) {
  const { t } = useTranslation()
  const { language: appLanguage } = useLanguage()
  // The APP language, not the popup's scoped estimate language: a push
  // notification is read by the operator, like the processing screen.
  const pushLanguage = useAppLanguage()
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
  // SEED-055 Phase D: set when the failure is a credits / paywall wall, so the
  // failure panel drops Retry / Edit manually and points at billing instead.
  const [billingBlock, setBillingBlock] = useState<BillingBlockCode | 'credits' | null>(null)
  const [retriesUsed, setRetriesUsed] = useState(0)
  // QUICK-psh-02: classification + specific questions from the vague terminal
  // (projects.needs_details via getAttemptOutcome), rendered as a compact panel
  // instead of the old generic toast. null = no needs_details outcome pending.
  // fallbackMessage is the path-specific vagueMessage (inline t() literal at
  // each handleEstimateOutcome call site) used when reason/questions are absent.
  const [needsDetailsInfo, setNeedsDetailsInfo] = useState<
    { reason?: string; questions?: string[]; fallbackMessage: string } | null
  >(null)
  // Credits plan 2026-11-20: the run paused for credits between steps; the
  // panel offers the packs and a buy resumes it (null = not paused).
  const [pausedInfo, setPausedInfo] = useState<
    | { next: 'analyze' | 'generate_estimate'; expiresAt: string | null; completedSteps: string[]; vagueMessage: string }
    | null
  >(null)

  // Multi-modal input state. Lazy-init from the saved draft (if any) so reopening
  // the popup restores the text the user typed before closing it.
  const [descriptionText, setDescriptionText] = useState(() => readDraft(draftKey))
  // Notices review stage 1: the AI's open questions as answer cards (refine mode).
  const [reviewQuestions, setReviewQuestions] = useState<{ questions: string[]; assumptions: string[] }>({ questions: [], assumptions: [] })
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [voiceFor, setVoiceFor] = useState<string[]>([])
  const [skippedQuestions, setSkippedQuestions] = useState<string[]>([])
  const submittedAnswersRef = useRef<string[]>([])
  const refineMode = !!refineEstimateId
  const refineModeRef = useRef(refineMode)
  refineModeRef.current = refineMode
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)

  // Seed the box once with `initialText` (appended below any saved draft).
  const appliedInitialTextRef = useRef<string | null>(null)
  useEffect(() => {
    if (!initialText || appliedInitialTextRef.current === initialText) return
    appliedInitialTextRef.current = initialText
    setDescriptionText((prev) => (prev.trim() ? `${prev}\n\n${initialText}` : initialText))
  }, [initialText])
  const [uploadedPhotos, setUploadedPhotos] = useState<Photo[]>([])
  // Per-photo items (uploading | done | error) drive the thumbnail strip.
  // `uploadedPhotos` stays the pipeline source of truth (only 'done' photos).
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([])
  const isUploadingPhotos = photoItems.some(i => i.status === 'uploading')

  // Keep the phone screen on for the whole hands-free window: while recording
  // (the user is talking at a job site, not touching the phone — an OS screen
  // lock here suspends the page and can lose the take) AND through the
  // upload/transcribe/generate wait, which is exactly the "gerar o orçamento"
  // screen the user watches without interacting. Released once the pipeline
  // reaches a surface that needs a tap anyway (failure, needs-details) or
  // finishes ('done' → the parent navigates/closes).
  const isPipelineRunning =
    stage !== 'idle' && stage !== 'done' && !failedAt && !needsDetailsInfo && !pausedInfo
  useWakeLock(isRecording || isPipelineRunning || isUploadingPhotos)

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
  // Set by Discard just before MediaRecorder.stop(): recorder.onstop reads it
  // (via resolveRecorderStop) to drop the take instead of dispatching it.
  const discardedRef = useRef(false)
  // Popup composer (isHorizontal): needs-details is an inline card, not a panel.
  const inlineNeedsDetailsRef = useRef(false)
  inlineNeedsDetailsRef.current = variant === 'popup' && mode === undefined
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
    // Refine mode never persists or resumes a recording (its resume would generate).
    if (refineModeRef.current) return
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

  // 260927: true while this recorder is watching a DISPATCHED attempt (the
  // server owns the pipeline from that point). Leaving now is safe for the
  // estimate; what it used to lose was the operator hearing about the result.
  const watchingRef = useRef(false)

  // Hands the watched attempt to the app-shell watcher
  // (components/capture/background-generation-watcher.tsx), which keeps reading
  // the journal and announces the outcome wherever the operator went.
  const backgroundEntry = useCallback((): BackgroundGeneration | null => {
    const attemptId = attemptIdRef.current
    if (!attemptId) return null
    return {
      attemptId,
      projectId,
      mode: mode ?? (audioBlob ? 'audio' : uploadedPhotos.length > 0 ? 'photos' : 'text'),
      projectName: isPlaceholderName(project.name) ? undefined : project.name,
      since: new Date().toISOString(),
    }
  }, [projectId, project.name, mode, audioBlob, uploadedPhotos.length])
  const handOffToBackground = useCallback(() => {
    if (!watchingRef.current) return
    const entry = backgroundEntry()
    if (entry) addBackgroundGeneration(entry)
  }, [backgroundEntry])

  // Closing the popup (X, Escape, outside click) or navigating away mid-run.
  const handOffRef = useRef(handOffToBackground)
  useEffect(() => {
    handOffRef.current = handOffToBackground
  }, [handOffToBackground])
  useEffect(() => () => handOffRef.current(), [])

  // "Continue in the background": the same hand-off, on purpose.
  const handleContinueInBackground = useCallback(() => {
    // 260928: subscribe this device to Web Push when that is on offer, so the
    // result reaches the phone even after the app is closed. Not awaited: the
    // permission prompt it opens must stay inside this click, and closing the
    // popup below must not wait for it.
    if (canOfferPushNow()) void enableBrowserPush(pushLanguage)
    handOffToBackground()
    if (onCancel) onCancel()
    else router.push(`/projects/${projectId}`)
  }, [handOffToBackground, onCancel, router, projectId, pushLanguage])


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
  const failAt = useCallback((
    s: StageKey,
    msg: string,
    opts?: { skipReport?: boolean; billingBlock?: BillingBlockCode | 'credits' }
  ) => {
    setFailedAt(s)
    setErrorMessage(msg)
    setBillingBlock(opts?.billingBlock ?? null)
    // A credits wall was already journaled server-side (insufficient_credits).
    if (opts?.billingBlock) return
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
      // Phase 168 (PHOTO-02 UI half): forward the analyze-step coverage
      // counts so the overlay can render "N of M photos analyzed".
      analyzedCount: progress.analyzedCount,
      totalCount: progress.totalCount,
      failedCount: progress.failedCount,
      // 260927: the checklist's per-row durations and facts.
      stepTimings: progress.stepTimings,
      phaseVisits: progress.phaseVisits,
    })
  }, [])

  // Every dispatch path watches its outcome through here, so watchingRef is
  // set for exactly as long as a dispatched attempt is being watched.
  const watchOutcome = useCallback(async () => {
    watchingRef.current = true
    try {
      return await pollEstimateOutcome({
        projectId,
        previousEstimateId: previousEstimateIdRef.current ?? null,
        signal: abortControllerRef.current.signal,
        attemptId: attemptIdRef.current ?? undefined,
        onStageProgress: handleStageProgress,
      })
    } finally {
      // An abort means the recorder is unmounting: the hand-off above still
      // needs to see this attempt as watched, so only a settled poll clears it.
      if (!abortControllerRef.current.signal.aborted) watchingRef.current = false
    }
  }, [projectId, handleStageProgress])

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
      if (outcome.photosSkipped) toast.info(skippedPhotosLine(t, outcome.photosSkipped), { duration: 15_000 })
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
      // The popup composer shows the questions inline above the text box, so
      // go straight back to it. The legacy route keeps the panel (and its
      // "Record again" button) instead.
      if (inlineNeedsDetailsRef.current) setStage('idle')
      setAudioBlob(null)
      recordingIdRef.current = null
      attemptIdRef.current = null
      requestIdRef.current = null
      previousEstimateIdRef.current = undefined
      setAttemptProgress(EMPTY_ATTEMPT_PROGRESS)
      return
    }
    if (outcome.state === 'paused') {
      setPausedInfo({
        next: outcome.next,
        expiresAt: outcome.expiresAt,
        completedSteps: outcome.completedSteps,
        vagueMessage,
      })
      return
    }
    if (outcome.state === 'failed') {
      // 260707-lyq (P4 Wave 2): journal-sourced failure — the server's REAL
      // error_message, surfaced within ~1 tick instead of the 6-minute
      // timeout. skipReport: true — the journal already has this failure
      // (the server wrote it), so failAt must not double-report it.
      failAt(stepToStageKey(outcome.step), outcome.reason, {
        skipReport: true,
        ...(outcome.creditBlocked ? { billingBlock: 'credits' as const } : {}),
      })
      return
    }
    // timeout. 260927: the journal went quiet for the whole idle window (or
    // the absolute cap passed). The server may still finish, so hand the
    // attempt to the app-shell watcher: if it does, the operator hears about
    // it instead of being told to go check.
    const entry = backgroundEntry()
    if (entry) addBackgroundGeneration(entry)
    failAt('generating', t('This is taking longer than usual. It keeps generating in the background and we will let you know when it is ready.'))
  }, [onComplete, projectId, router, t, failAt, stepToStageKey, backgroundEntry])

  // Credits plan 2026-11-20: credits bought from the paused panel. The server
  // resumes once the grant reaches the paused run, so keep watching: a tick
  // that still reads "paused" right after the buy is the grant in flight.
  const handleResumeAfterPurchase = useCallback(async () => {
    const vague = pausedInfo?.vagueMessage ?? ''
    setPausedInfo(null)
    setStage('generating')
    let outcome = await watchOutcome()
    for (let i = 0; i < 24 && outcome.state === 'paused'; i++) {
      await new Promise((r) => setTimeout(r, 2500))
      if (abortControllerRef.current.signal.aborted) return
      outcome = await watchOutcome()
    }
    handleEstimateOutcome(outcome, vague)
  }, [pausedInfo, watchOutcome, handleEstimateOutcome])

  // QUICK-psh-02: the needs-details panel's "Record again" action — dismisses
  // the panel and reveals the (already-reset) recorder UI.
  const handleNeedsDetailsRecordAgain = useCallback(() => {
    setNeedsDetailsInfo(null)
    setStage('idle')
  }, [])

  // Multi-modal helpers
  const refinePhotoCount = photoItems.filter((i) => i.status === 'done' && i.blob).length
  const answerCount = refineEstimateId ? answeredCount(reviewQuestions.questions, answers, voiceFor) : 0
  const hasAnyInput =
    !!audioBlob ||
    answerCount > 0 ||
    descriptionText.trim().length > 0 ||
    (refineMode ? refinePhotoCount > 0 : uploadedPhotos.length > 0)

  const refine = useRefineFlow({
    estimateId: refineEstimateId ?? '',
    projectId,
    onDone: () => onRefineDone?.(),
    // The instruction was applied: the saved draft text has served its purpose.
    onApplied: () => {
      // Answered questions leave the list (and the dock counter) for good.
      if (refineEstimateId && submittedAnswersRef.current.length > 0) {
        resolveQuestions(refineEstimateId, { answered: submittedAnswersRef.current })
        submittedAnswersRef.current = []
      }
      if (typeof window === 'undefined' || !draftKey) return
      try {
        localStorage.removeItem(draftStorageKey(draftKey))
      } catch {
        /* best-effort */
      }
    },
  })

  // Handle photo file selection. Each accepted file gets an immediate
  // 'uploading' thumbnail placeholder that flips to 'done' (with its Photo) or
  // 'error'. Enforces the MAX_PHOTOS hard cap with a toast on overflow.
  // Shared by the file input and by drag-and-drop onto the composer.
  const addPhotoFiles = useCallback(async (files: ArrayLike<File> | null | undefined) => {
    if (!files || files.length === 0) return

    const images = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (images.length === 0) {
      if (photoInputRef.current) photoInputRef.current.value = ''
      return
    }

    // Cap math against the current item count (uploading + done + error).
    const currentCount = photoItemsRef.current.length
    const { take, overflowed } = clampToPhotoLimit(
      currentCount,
      images.length,
      refineModeRef.current ? REFINE_MAX_PHOTOS : MAX_PHOTOS
    )
    if (overflowed) {
      toast.info(
        refineModeRef.current
          ? t('You can add up to 5 photos when editing with AI.')
          : t('You can add up to 16 photos.')
      )
    }
    if (take <= 0) {
      if (photoInputRef.current) photoInputRef.current.value = ''
      return
    }
    const accepted = images.slice(0, take)

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

      // Refine mode: the photo travels WITH the refine request. It is not
      // uploaded as a project photo (no storage object, no photos row).
      if (refineModeRef.current) {
        setPhotoItems(prev => [...prev, { id: photoId, status: 'done', previewUrl, blob }])
        return
      }

      // Show the placeholder immediately (before awaiting upload).
      setPhotoItems(prev => [...prev, { id: photoId, status: 'uploading', previewUrl }])

      const flip = (status: PhotoItemStatus, photo?: Photo) =>
        setPhotoItems(prev => prev.map(it => it.id === photoId ? { ...it, status, photo } : it))

      // CAPT-01: retry (3 tries, exponential backoff) — self-heals a transient
      // network flap or 5xx instead of failing the whole photo on the first
      // blip. The server re-encodes to WebP and creates the DB record.
      const fd = new FormData()
      fd.set('file', blob, `${photoId}.jpg`)
      const result = await uploadProjectPhotoWithRetry(projectId, fd, sortBase + index)
      if ('error' in result) {
        console.error('[capture] photo upload failed:', result.error)
        flip('error')
        return
      }
      const photo = result.data as Photo
      flip('done', photo)
      setUploadedPhotos(prev => [...prev, photo])
    }))

    if (photoInputRef.current) photoInputRef.current.value = ''
  }, [projectId, t])

  const handlePhotoFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => addPhotoFiles(e.target.files),
    [addPhotoFiles],
  )

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
    setBillingBlock(null)
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
      try {
        // Phase 189 Plan 03 (UPLOAD-01/UPLOAD-04): server-issued ticket
        // replaces the client-constructed storagePath. uploadViaTicket
        // composes uploadWithRetry unchanged (3 tries, exponential backoff
        // 1s/2s/4s, retry only on network/5xx — never on 4xx/quota). Error
        // surface is unchanged: failAt fires exactly as before once retries
        // exhaust.
        const uploaded = await uploadViaTicket(
          { bucket: 'audio', projectId, blob, contentType: mimeTypeRef.current || 'audio/webm' },
          { signal: abortControllerRef.current?.signal },
        )
        storagePath = uploaded.path // server-issued key — NOT locally constructed
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
      failAt('saving', started.error ?? t('Failed to save recording'), {
        billingBlock: isBillingBlockCode(started.code) ? started.code : undefined,
      })
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
      const outcome = await watchOutcome()

      handleEstimateOutcome(
        outcome,
        t('Description too vague — please record again with specific tasks, materials, and quantities')
      )
    } catch (err) {
      if (isAbortSignal(err)) return  // unmount; not a user-facing failure
      failAt('generating', (err as Error).message ?? t('Estimate generation failed'))
    }
  }, [projectId, estimateLanguage, ensureAttempt, captureOutcomeBaseline, watchOutcome, ensureStepMedians, t, failAt, handleEstimateOutcome, pendingCaptureKey])

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

  // Unified generation handler (text-only, audio, or photos-only). `photos` is
  // the uploaded photo set to generate from (the closure's `uploadedPhotos`,
  // or the freshly uploaded set when "Regenerate from scratch" runs from refine mode).
  const handleGenerateWith = useCallback(async (photos: Photo[]) => {
    abortControllerRef.current = new AbortController()
    setFailedAt(undefined)
    setErrorMessage(undefined)
    setBillingBlock(null)
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

    if (descriptionText.trim() && !audioBlob) {
      // Text path (with or without photos): ONE dispatch (createTextRecording's
      // autoGenerateEstimate chain — Plan 01) then watch the DB. When photos are
      // attached they are NOT sent through /api/analyze-photos here: that route
      // would never save the typed text. The generate-estimate job analyzes any
      // photo still lacking a description before it reads them (server-side
      // safety net), so text + photos produce one estimate built from both. No separate job to race — the
      // dispatch either succeeded (jobId returned) or returned { error }.
      setStage('saving')
      await captureOutcomeBaseline()
      const recording = await createTextRecording(projectId, descriptionText.trim(), attemptIdRef.current ?? undefined, {
        autoGenerateEstimate: true,
        requestId: requestIdRef.current ?? undefined,
        estimateLanguage,
      })
      if ('error' in recording) {
        failAt('saving', recording.error ?? t('Failed to save description'), {
          billingBlock: isBillingBlockCode(recording.code) ? recording.code : undefined,
        })
        return
      }
      setStage('generating')
      try {
        const outcome = await watchOutcome()
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
    } else if (photos.length > 0) {
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

        const outcome = await watchOutcome()

        handleEstimateOutcome(
          outcome,
          t('Photos too vague — please add a voice description or more detailed photos')
        )
      } catch (err) {
        if (isAbortSignal(err)) return
        failAt('analyzing', (err as Error).message ?? t('Estimate generation failed'))
      }
    }
  }, [descriptionText, audioBlob, projectId, runPipeline, estimateLanguage, t, ensureAttempt, captureOutcomeBaseline, watchOutcome, ensureStepMedians, failAt, handleEstimateOutcome])

  const handleGenerate = useCallback(() => handleGenerateWith(uploadedPhotos), [handleGenerateWith, uploadedPhotos])

  // Refine mode submit: the typed text, voice take and photos go to the refine
  // preview route; the review step shows the result before anything is applied.
  const handleRefineSubmit = useCallback(async () => {
    const photos = photoItemsRef.current.filter((i) => i.blob).map((i) => i.blob as Blob)
    const { questions } = reviewQuestions
    submittedAnswersRef.current = questions.filter((q) => (answers[q] ?? '').trim() || voiceFor.includes(q))
    const instruction = composeRefineInstruction({ questions, answers, voiceFor, extra: descriptionText })
    await refine.submit({ instruction, audio: audioBlob, photos })
  }, [refine, descriptionText, audioBlob, reviewQuestions, answers, voiceFor])

  // Refine mode: read the open questions from the mounted editor (none when the
  // popup was opened from another page). Answered ones are already gone.
  useEffect(() => {
    if (!refineEstimateId) return
    const review = getRefineEditor(refineEstimateId)?.review?.()
    if (!review) return
    const resolved = readResolvedQuestions(refineEstimateId)
    setReviewQuestions({ questions: openReviewQuestions(review.questions, resolved), assumptions: review.assumptions })
    setSkippedQuestions(resolved.skipped)
  }, [refineEstimateId])

  // Notices review stage 1, part 2: "Answer and generate" on a project waiting
  // for details opens this composer with the AI's questions above the text box
  // (the same inline card a needs-details outcome shows). Cleared when the
  // pipeline starts, like that card.
  useEffect(() => {
    if (refineEstimateId || !inlineNeedsDetailsRef.current) return
    const questions = readCapturePrompts(projectId)
    if (questions.length === 0) return
    setNeedsDetailsInfo({ questions, fallbackMessage: '' })
  }, [projectId, refineEstimateId])



  // Explicit, confirmed escape hatch: today's generate behavior (full
  // regeneration, new version). Local refine photos are uploaded first, since
  // the generate path reads project photos from storage.
  const handleRegenerateConfirmed = useCallback(async () => {
    setConfirmRegenerate(false)
    const pending = photoItemsRef.current.filter((i) => i.blob && !i.photo)
    const uploaded: Photo[] = [...uploadedPhotosRef.current]
    for (const [index, item] of pending.entries()) {
      const fd = new FormData()
      fd.set('file', item.blob as Blob, `${item.id}.jpg`)
      const result = await uploadProjectPhotoWithRetry(projectId, fd, uploaded.length + index)
      if ('error' in result) {
        toast.error(t('Failed to upload photo'))
        return
      }
      uploaded.push(result.data as Photo)
    }
    setUploadedPhotos(uploaded)
    await handleGenerateWith(uploaded)
  }, [projectId, handleGenerateWith, t])

  // Start recording
  const startRecording = useCallback(async () => {
    chunksRef.current = []
    setElapsedMs(0)
    elapsedMsRef.current = 0
    accumulatedMsRef.current = 0
    setIsPaused(false)
    warnedRef.current = false
    discardedRef.current = false

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
        const action = resolveRecorderStop({
          discarded: discardedRef.current,
          refineMode: refineModeRef.current,
          blobSize: blob.size,
          elapsedMs: elapsedMsRef.current,
        })
        discardedRef.current = false
        // Discarded by the user: no blob kept, nothing persisted or dispatched, no toast.
        if (action === 'discard') return
        // Refine mode: keep the take for the "See changes" submit. No IDB
        // persist (its resume path generates) and no pipeline dispatch.
        if (action === 'too-short') {
          toast.error(t('Recording too short — please record at least a few seconds describing the job.'))
          return
        }
        if (action === 'keep-for-refine') {
          setAudioBlob(blob)
          return
        }
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
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  // A per-question mic starts the popup's one recorder and notes which
  // questions the take answers. A new take replaces the previous one, so the
  // questions only it answered go back to unanswered.
  const handleVoiceAnswer = useCallback((question: string) => {
    if (isRecording) {
      setVoiceFor((v) => (v.includes(question) ? v : [...v, question]))
      return
    }
    setVoiceFor((v) => (audioBlob ? [question] : v.includes(question) ? v : [...v, question]))
    handleToggleRecording()
  }, [isRecording, audioBlob, handleToggleRecording])

  const handleSkipQuestion = useCallback((question: string) => {
    setSkippedQuestions((s) => (s.includes(question) ? s : [...s, question]))
    if (refineEstimateId) resolveQuestions(refineEstimateId, { skipped: [question] })
  }, [refineEstimateId])

  const refineQuestionsProps: RefineQuestionsProps | null =
    refineEstimateId && (reviewQuestions.questions.length > 0 || reviewQuestions.assumptions.length > 0)
      ? {
          questions: reviewQuestions.questions,
          assumptions: reviewQuestions.assumptions,
          answers,
          onAnswer: (q, a) => setAnswers((prev) => ({ ...prev, [q]: a })),
          voiceFor,
          onVoice: handleVoiceAnswer,
          skipped: skippedQuestions,
          onSkip: handleSkipQuestion,
          recording: isRecording,
        }
      : null

  // Throw the take away: stop the recorder and release the microphone like
  // stopRecording, but flag the take first so recorder.onstop drops it. Unlike
  // stopRecording this leaves `stage` alone (nothing is dispatched).
  const discardRecording = useCallback(() => {
    const rec = mediaRecorderRef.current
    if (!rec || rec.state === 'inactive') return
    discardedRef.current = true
    rec.stop()
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current)
      tickIntervalRef.current = null
    }
    streamRef.current?.getTracks().forEach(tr => tr.stop())
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    chunksRef.current = []
    accumulatedMsRef.current = 0
    segmentStartRef.current = null
    elapsedMsRef.current = 0
    setElapsedMs(0)
    setAnalyser(null)
    setIsRecording(false)
    setIsPaused(false)
    toast(t('Recording discarded'))
  }, [t])

  // Create a blank estimate then navigate — used by "Edit manually" so the user
  // lands on the EstimateEditor instead of the empty-state card (which has a
  // disabled Generate button when no transcript exists).
  async function handleEditManually() {
    const blank = await createBlankEstimate(projectId)
    if (showBillingBlockToast((blank as { code?: unknown }).code, router, t)) return
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
    // 260927: this recorder watches the attempt again from here, so the
    // background watcher must not announce it a second time.
    if (attemptIdRef.current) removeBackgroundGeneration(attemptIdRef.current)
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

  const refineBusy = refine.phase === 'saving' || refine.phase === 'refining'
  const refineReviewing = refineMode && !!refine.review && (refine.phase === 'review' || refine.phase === 'applying')

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
      {showRecorderUI && refineReviewing && refine.review ? (
        <RefineReview
          diff={refine.review.diff}
          currencyCode={refine.review.currencyCode}
          totals={refine.review.totals}
          applying={refine.phase === 'applying'}
          onApply={() => void refine.apply()}
          onDiscard={refine.discard}
        />
      ) : showRecorderUI && refineMode && refineBusy ? (
        <RefineWorking phase={refine.phase === 'saving' ? 'saving' : 'refining'} />
      ) : showRecorderUI ? (
        <>
          {refineMode && !refine.creditBlocked && (
            <p className="mx-5 mt-1 rounded-xl bg-primary/10 px-3 py-2.5 text-[13px] text-muted-foreground" data-testid="refine-mode-hint">
              {refineQuestionsProps && refineQuestionsProps.questions.length > 0
                ? t('Answer what you know. The rest can stay as it is.')
                : t('This will update the current estimate. You review the changes before they are applied.')}
            </p>
          )}
          {refineMode && refine.creditBlocked && (
            <div className="mx-5 mt-1 flex flex-col gap-3" data-testid="refine-credit-block">
              <p className="rounded-2xl bg-muted px-4 py-3.5 text-[13.5px] leading-snug text-foreground/90">
                <b className="font-semibold">{t('Your credits ran out.')}</b>{' '}
                {t('Your answers are kept: top up and the AI picks up where it stopped.')}
              </p>
              <BuyCreditsInline ctaVerb="continue" onPurchased={() => void refine.retryAfterPurchase()} />
            </div>
          )}
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
            onDiscard={() => {
              discardRecording()
              if (!audioBlob) setVoiceFor([])
            }}
            // Multi-modal props
            descriptionText={descriptionText}
            setDescriptionText={setDescriptionText}
            uploadedPhotos={uploadedPhotos}
            isUploadingPhotos={isUploadingPhotos}
            photoItems={photoItems}
            onRemovePhoto={handleRemovePhoto}
            photoInputRef={photoInputRef}
            onPhotoFileChange={handlePhotoFileChange}
            onPhotoFiles={addPhotoFiles}
            hasAnyInput={hasAnyInput}
            onGenerate={refineMode ? handleRefineSubmit : handleGenerate}
            refineMode={refineMode}
            hasAudio={!!audioBlob}
            onClearAudio={() => {
              setAudioBlob(null)
              setVoiceFor([])
            }}
            onRegenerate={() => setConfirmRegenerate(true)}
            refineQuestions={refineQuestionsProps}
            answerCount={answerCount}
            // Language selector
            estimateLanguage={estimateLanguage}
            setEstimateLanguage={setEstimateLanguage}
            // Single-modality lock (undefined in legacy fullscreen route → all three blocks)
            mode={mode}
            // Horizontal layout: popup with no mode lock
            isHorizontal={isPopup && mode === undefined}
            onStartBlank={onStartBlank}
            needsDetails={inlineNeedsDetailsRef.current ? needsDetailsInfo : null}
          />
        </>
      ) : isPopup ? (
        // Popup variant. 260927: the checklist flows in the page instead of
        // being absolutely positioned. The recorder UI is not rendered once the
        // pipeline runs, so there is nothing to cover, and an absolute overlay
        // was clipped to the container's 260px minimum (the checklist is ~470px
        // tall). `overflow-y-auto` keeps a tall photos-mode checklist inside
        // the Dialog's max-height on short phones.
        // flex-col so the processing view can pin its header/footer and the
        // failure panel spans the dialog body. (Needs-details never lands here:
        // the popup composer shows it inline, see inlineNeedsDetailsRef.)
        <div className="relative flex flex-1 min-h-[260px] flex-col overflow-y-auto">
          {/* 260707-o7a: real journal-driven progress — segments only advance on
              journal succeeded events (attemptProgress via handleStageProgress);
              medians make the in-segment fill an honest elapsed-vs-typical read. */}
          {!failedAt && pausedInfo && (
            <CapturePaused
              next={pausedInfo.next}
              completedSteps={pausedInfo.completedSteps}
              expiresAt={pausedInfo.expiresAt}
              hasAudio={activeMode === 'audio' || !!audioBlob}
              hasPhotos={uploadedPhotos.length > 0}
              onPurchased={() => void handleResumeAfterPurchase()}
            />
          )}
          {!failedAt && !pausedInfo && (
            <CaptureProcessingOverlay
              layout="popup"
              stage={stage}
              mode={activeMode}
              completedSteps={attemptProgress.completedSteps}
              activeStep={attemptProgress.activeStep}
              activeStepStartedAt={attemptProgress.activeStepStartedAt}
              medians={stepMedians}
              analyzedCount={attemptProgress.analyzedCount}
              totalCount={attemptProgress.totalCount}
              failedCount={attemptProgress.failedCount}
              stepTimings={attemptProgress.stepTimings}
              phaseVisits={attemptProgress.phaseVisits}
              showLeaveHint={stage !== 'saving'}
              onContinueInBackground={stage === 'saving' ? undefined : handleContinueInBackground}
            />
          )}
          {failedAt && (
            <div className="flex flex-1 flex-col">
              <CaptureFailure
                errorMessage={errorMessage ?? t('Something went wrong')}
                retriesUsed={retriesUsed}
                onRetry={hasAnyInput ? handleRetry : undefined}
                onEditManually={handleEditManually}
                billingBlock={billingBlock ?? undefined}
              />
            </div>
          )}
        </div>
      ) : (
        // Legacy fullscreen /capture route. 260927: the same journal-driven
        // checklist as the popup, in place of the old four-dot stepper.
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md space-y-6">
            {!failedAt && pausedInfo && (
              <CapturePaused
                next={pausedInfo.next}
                completedSteps={pausedInfo.completedSteps}
                expiresAt={pausedInfo.expiresAt}
                hasAudio={activeMode === 'audio' || !!audioBlob}
                hasPhotos={uploadedPhotos.length > 0}
                onPurchased={() => void handleResumeAfterPurchase()}
              />
            )}
            {!failedAt && !needsDetailsInfo && !pausedInfo && (
              <CaptureProcessingOverlay
                layout="inline"
                stage={stage}
                mode={activeMode}
                completedSteps={attemptProgress.completedSteps}
                activeStep={attemptProgress.activeStep}
                activeStepStartedAt={attemptProgress.activeStepStartedAt}
                medians={stepMedians}
                analyzedCount={attemptProgress.analyzedCount}
                totalCount={attemptProgress.totalCount}
                failedCount={attemptProgress.failedCount}
                stepTimings={attemptProgress.stepTimings}
                phaseVisits={attemptProgress.phaseVisits}
                showLeaveHint={stage !== 'saving'}
                onContinueInBackground={stage === 'saving' ? undefined : handleContinueInBackground}
              />
            )}
            {failedAt && (
              <CaptureFailure
                errorMessage={errorMessage ?? t('Something went wrong')}
                retriesUsed={retriesUsed}
                onRetry={hasAnyInput ? handleRetry : undefined}
                onEditManually={handleEditManually}
                  billingBlock={billingBlock ?? undefined}
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
      {refineMode && (
        <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
          <AlertDialogContent data-testid="regenerate-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t('Regenerate from scratch?')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('This builds a brand new estimate version from what you entered here, instead of changing the current one. The current version stays in the history.')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="regenerate-cancel">{t('Cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleRegenerateConfirmed()} data-testid="regenerate-confirm-btn">
                {t('Regenerate')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}


// RecorderBody — the visual recorder (waveform + timer + mic button + inputs).
// The popup composer (isHorizontal) and the stacked layout are separate
// components so each keeps its own hooks.
export interface RecorderBodyProps {
  analyser: AnalyserNode | null
  isRecording: boolean
  // 260707-ru5: pause state (popup-only feature — see onPause below)
  isPaused: boolean
  elapsedMs: number
  ringColorClass: string
  progress: number
  onToggle: () => void
  // 260707-ru5: toggles pause/resume — resumeRecording when isPaused, else
  // pauseRecording. Only rendered in the popup dock when SUPPORTS_PAUSE.
  onPause: () => void
  // Throws the current take away (popup dock, recording view).
  onDiscard?: () => void
  // Multi-modal props
  descriptionText: string
  setDescriptionText: React.Dispatch<React.SetStateAction<string>>
  uploadedPhotos: Photo[]
  isUploadingPhotos: boolean
  photoItems: PhotoItem[]
  onRemovePhoto: (id: string) => void
  photoInputRef: React.RefObject<HTMLInputElement | null>
  onPhotoFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  // Image files dropped onto the popup composer; same path as the file input.
  onPhotoFiles?: (files: ArrayLike<File>) => Promise<void>
  hasAnyInput: boolean
  onGenerate: () => Promise<void>
  // Refine mode (Edit with AI on an existing estimate)
  refineMode?: boolean
  hasAudio?: boolean
  onClearAudio?: () => void
  onRegenerate?: () => void
  /** Refine mode: the AI's open questions as answer cards (null = none). */
  refineQuestions?: RefineQuestionsProps | null
  /** Refine mode: how many questions the request answers (shown on the CTA). */
  answerCount?: number
  // Language selector props
  estimateLanguage: EstimateLanguage
  setEstimateLanguage: (lang: EstimateLanguage) => void
  // Single-modality lock — undefined renders the unified layout
  mode?: CaptureMode
  // Popup composer (popup + unified mode)
  isHorizontal: boolean
  /** Resolves false when the blank estimate could not be created (the caller already toasted). */
  onStartBlank?: () => Promise<boolean | void>
  // Popup composer: the AI's follow-up questions from a needs-details outcome,
  // shown as an inline card above the text box until the next attempt starts.
  needsDetails?: { reason?: string; questions?: string[]; fallbackMessage: string } | null
}

export function RecorderBody(props: RecorderBodyProps) {
  return props.isHorizontal ? <PopupBody {...props} /> : <StackedBody {...props} />
}

const PRIMARY_GRADIENT = { backgroundImage: 'linear-gradient(135deg, hsl(219 92% 65%), hsl(228 84% 54%))' }
const ROUND_BUTTON =
  'relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/15 disabled:pointer-events-none disabled:opacity-50 sm:h-[50px] sm:w-[50px]'
const PRIMARY_BUTTON =
  'relative flex h-14 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-[18px] text-base font-semibold text-white shadow-[0_10px_24px_-10px_hsl(224_86%_50%/0.8)] transition-opacity hover:opacity-90 sm:h-[50px] sm:text-[15px]'
const TIP_ROTATE_MS = 4200
const TEXTAREA_MAX_PX = 172

// SSR-safe matchMedia subscription (false on the server and where matchMedia is missing).
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false),
    () => false,
  )
}

function PopupBody({
  analyser, isRecording, isPaused, elapsedMs, onToggle, onPause, onDiscard,
  descriptionText, setDescriptionText, isUploadingPhotos, photoItems, onRemovePhoto,
  photoInputRef, onPhotoFileChange, onPhotoFiles, hasAnyInput, onGenerate,
  refineMode = false, hasAudio = false, onClearAudio, onRegenerate, onStartBlank, needsDetails,
  refineQuestions = null, answerCount = 0,
}: RecorderBodyProps) {
  const { t } = useTranslation()
  const isSm = useMediaQuery('(min-width: 640px)')
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [dragging, setDragging] = useState(false)
  const [tipIndex, setTipIndex] = useState(0)
  // Creating the blank estimate and navigating takes a moment; show it at once
  // and keep it until the page changes (success unmounts this popup).
  const [startingBlank, setStartingBlank] = useState(false)
  async function handleStartBlank() {
    if (!onStartBlank || startingBlank) return
    setStartingBlank(true)
    try {
      if ((await onStartBlank()) === false) setStartingBlank(false)
    } catch {
      setStartingBlank(false)
    }
  }

  const needsShown = !!needsDetails && !isRecording
  const hasText = descriptionText.trim().length > 0
  const photoCount = photoItems.length
  const maxPhotos = refineMode ? REFINE_MAX_PHOTOS : MAX_PHOTOS

  // Grow with the content up to TEXTAREA_MAX_PX, then scroll. Re-run when the
  // textarea remounts after a recording.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`
  }, [descriptionText, isRecording])

  // Rotate the dictation tips while actually recording; reduced motion pins the first.
  useEffect(() => {
    if (!isRecording || isPaused || reducedMotion) return
    const id = setInterval(() => setTipIndex((i) => (i + 1) % 4), TIP_ROTATE_MS)
    return () => clearInterval(id)
  }, [isRecording, isPaused, reducedMotion])

  const tips = [
    t('Say the measurements: length, area, quantity'),
    t('Mention materials and brands, if the client has a preference'),
    t('Mention the deadline and any difficult access'),
    t('Say what the client will provide'),
  ]

  const placeholder = refineMode
    ? t('What do you want to change in this estimate?')
    : needsShown
      ? t('Answer here or tap to talk...')
      : isSm
        ? t('Describe the job, or drop photos here...')
        : t('Talk or type the job...')

  // The camera while recording: pause first (the picker can interrupt the mic
  // on iOS), tell the person, then open the picker. Without pause support the
  // button is disabled while recording.
  const openPhotoPicker = () => {
    if (isRecording) {
      if (!SUPPORTS_PAUSE) return
      if (!isPaused) {
        onPause()
        toast(t('Recording paused while you pick photos'))
      }
    }
    photoInputRef.current?.click()
  }
  const cameraDisabled = isUploadingPhotos || photoCount >= MAX_PHOTOS || (isRecording && !SUPPORTS_PAUSE)
  const canAddTile = !cameraDisabled && photoCount < maxPhotos

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && hasAnyInput && !isRecording) {
      e.preventDefault()
      void onGenerate()
    }
  }

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
  const dropProps = onPhotoFiles
    ? {
        onDragOver: (e: React.DragEvent) => { if (hasFiles(e)) { e.preventDefault(); setDragging(true) } },
        onDragLeave: () => setDragging(false),
        onDrop: (e: React.DragEvent) => {
          if (!hasFiles(e)) return
          e.preventDefault()
          setDragging(false)
          void onPhotoFiles(e.dataTransfer.files)
        },
      }
    : {}

  const carry: string[] = []
  if (hasText) carry.push(t('the typed text'))
  if (photoCount > 0) carry.push(`${photoCount} ${photoCount === 1 ? t('photo') : t('photos')}`)

  const strip = photoCount > 0 && (
    <PhotoThumbnailGrid
      items={photoItems}
      onRemove={onRemovePhoto}
      singleRow
      max={maxPhotos}
      onAdd={canAddTile ? openPhotoPicker : undefined}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          'relative flex min-h-[196px] flex-1 flex-col gap-2.5 overflow-y-auto px-5 pt-1 pb-0.5 transition-colors sm:min-h-[214px]',
          dragging && 'bg-primary/5',
        )}
        {...dropProps}
      >
        {isRecording ? (
          <>
            <div className="flex items-center justify-between pt-1">
              <div
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold uppercase leading-none tracking-[0.09em]',
                  isPaused ? 'bg-amber-500/15 text-amber-500' : 'bg-red-500/10 text-red-500',
                )}
                data-testid="capture-recording-status"
              >
                <span
                  className={cn('h-[7px] w-[7px] rounded-full bg-current', !isPaused && 'motion-safe:animate-pulse')}
                  aria-hidden
                />
                {isPaused ? t('Paused') : t('Listening')}
              </div>
              <button
                type="button"
                onClick={onDiscard}
                className="inline-flex items-center gap-1.5 px-1 py-2.5 text-[13px] font-medium leading-none text-muted-foreground transition-colors hover:text-foreground"
                data-testid="capture-discard"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {t('Discard')}
              </button>
            </div>
            <div className="flex items-baseline justify-center gap-2.5">
              <CaptureTimer
                elapsedMs={elapsedMs}
                className={cn('text-[46px] font-semibold leading-none tracking-[-0.025em] sm:text-[52px]', isPaused && 'text-muted-foreground')}
              />
              <small className="text-[13px] tabular-nums text-muted-foreground">
                {t('max.')} {formatDuration(HARD_CAP_MS / 1000)}
              </small>
            </div>
            <div className="w-full shrink-0">
              <WaveformVisualizer analyser={analyser} isRecording={isRecording && !isPaused} height={isSm ? 60 : 52} />
            </div>
            <p className="m-0 min-h-[18px] text-center text-[13px] text-muted-foreground">
              <b className="mr-1.5 font-semibold text-primary">{t('Tip')}</b>
              <span>{tips[reducedMotion ? 0 : tipIndex]}</span>
            </p>
            {carry.length > 0 && (
              <p className="m-0 text-center text-[12.5px] text-muted-foreground/80">
                {t('Goes with the recording:')} {carry.join(` ${t('and')} `)}
              </p>
            )}
            {strip}
          </>
        ) : (
          <>
            {needsDetails && (
              <CaptureNeedsDetails
                variant="inline"
                reason={needsDetails.reason}
                questions={needsDetails.questions}
                fallbackMessage={needsDetails.fallbackMessage}
              />
            )}
            {refineMode && refineQuestions && (
              <div className="pt-2">
                <RefineQuestions {...refineQuestions} />
                {refineQuestions.questions.length > 0 && (
                  <p className="mt-4 px-0.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                    {t('Anything else to change?')}
                  </p>
                )}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={descriptionText}
              onChange={(e) => setDescriptionText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={refineMode && refineQuestions && refineQuestions.questions.length > 0 ? t('Type it, or tap the mic and talk') : placeholder}
              rows={2}
              className="block min-h-[62px] max-h-[172px] w-full flex-none resize-none overflow-y-auto border-0 bg-transparent py-1.5 text-[17px] leading-[1.45] caret-primary outline-none placeholder:text-muted-foreground/70 focus:outline-none focus:ring-0 sm:min-h-24"
              data-testid="capture-description"
            />
            {refineMode && hasAudio && (
              <div className="flex flex-wrap gap-2">
                <span
                  className="inline-flex items-center gap-2 rounded-full bg-primary/10 py-1.5 pl-3 pr-1.5 text-[13px] font-medium leading-none text-primary"
                  data-testid="refine-voice-chip"
                >
                  <Mic className="h-3.5 w-3.5" aria-hidden />
                  {t('Voice note')}
                  <button
                    type="button"
                    onClick={onClearAudio}
                    aria-label={t('Remove voice note')}
                    className="flex h-6 w-6 items-center justify-center rounded-full opacity-80 transition-opacity hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              </div>
            )}
            {!needsShown && refineMode && (
              <div className="mt-auto flex flex-col text-[13px] text-muted-foreground">
                <button
                  type="button"
                  onClick={onRegenerate}
                  disabled={!hasAnyInput}
                  className="pt-2 pb-1.5 text-left leading-snug disabled:opacity-50"
                  data-testid="regenerate-from-scratch-btn"
                >
                  {t('Prefer to redo everything?')}{' '}
                  <span className="font-medium text-primary">{t('Regenerate from scratch')}</span>
                </button>
              </div>
            )}
            {!needsShown && !refineMode && onStartBlank && !hasText && (
              <div className="mt-auto flex flex-col text-[13px] text-muted-foreground">
                <span>{t('It helps to mention the job, the measurements and the materials.')}</span>
                <button
                  type="button"
                  onClick={() => void handleStartBlank()}
                  disabled={startingBlank}
                  aria-busy={startingBlank}
                  className="pt-2 pb-1.5 text-left leading-snug disabled:cursor-wait"
                  data-testid="start-from-scratch-btn"
                >
                  {startingBlank ? (
                    <span className="inline-flex items-center gap-2 font-medium text-primary">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      {t('Opening a blank estimate...')}
                    </span>
                  ) : (
                    <>
                      {t('Prefer to build it by hand?')} <span className="font-medium text-primary">{t('Start blank')}</span>
                    </>
                  )}
                </button>
              </div>
            )}
            {strip}
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2.5 px-4 pt-2.5 pb-4 sm:px-5 sm:pb-5">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onPhotoFileChange}
        />
        <button
          type="button"
          className={ROUND_BUTTON}
          onClick={openPhotoPicker}
          disabled={cameraDisabled}
          aria-label={t('Add photos')}
          data-testid="capture-add-photos"
        >
          {isUploadingPhotos ? <LoadingDots /> : <Camera className="h-[22px] w-[22px]" aria-hidden />}
          {photoCount > 0 && (
            <span className="absolute -right-[3px] -top-[3px] min-w-[21px] rounded-full border-2 border-background bg-primary px-1 text-center text-[11px] font-semibold leading-[17px] tabular-nums text-primary-foreground">
              {photoCount}
            </span>
          )}
        </button>

        {isRecording && SUPPORTS_PAUSE && (
          <button
            type="button"
            className={ROUND_BUTTON}
            onClick={onPause}
            aria-label={isPaused ? t('Resume recording') : t('Pause recording')}
            data-testid="capture-pause"
          >
            {isPaused ? <Play className="h-[22px] w-[22px] fill-current" aria-hidden /> : <Pause className="h-[22px] w-[22px] fill-current" aria-hidden />}
          </button>
        )}
        {!isRecording && hasAnyInput && (
          <button
            type="button"
            className={ROUND_BUTTON}
            onClick={onToggle}
            aria-label={t('Record audio')}
            data-testid="capture-mic"
          >
            <Mic className="h-[22px] w-[22px]" aria-hidden />
          </button>
        )}

        {isRecording ? (
          <button
            type="button"
            className={PRIMARY_BUTTON}
            style={PRIMARY_GRADIENT}
            onClick={onToggle}
            aria-label={t('Stop recording')}
            data-testid="capture-mic"
          >
            <Square className="h-[18px] w-[18px] fill-current" aria-hidden />
            {refineMode ? t('Finish recording') : t('Stop and generate')}
          </button>
        ) : hasAnyInput ? (
          <button
            type="button"
            className={PRIMARY_BUTTON}
            style={PRIMARY_GRADIENT}
            onClick={() => void onGenerate()}
            data-testid={refineMode ? 'refine-preview-btn' : 'generate-estimate-btn'}
          >
            {/* Sparkles draws its star well inside the viewBox, so it needs a
                larger box than the mic to look the same size. */}
            <Sparkles className="h-[22px] w-[22px] shrink-0" aria-hidden />
            {refineMode ? t('See changes') : t('Generate estimate')}
            {refineMode && answerCount > 0 && (
              <span className="font-medium opacity-80" data-testid="refine-answer-count">
                · {answerCount === 1 ? t('1 answer') : t('{count} answers').replace('{count}', String(answerCount))}
              </span>
            )}
            <span className="ml-1 hidden rounded-md border border-white/40 px-[7px] py-[5px] text-[11.5px] font-medium leading-none text-white/90 sm:inline" aria-hidden>
              Ctrl ↵
            </span>
          </button>
        ) : (
          <button
            type="button"
            className={cn(PRIMARY_BUTTON, 'after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:shadow-[0_0_0_7px_hsl(224_86%_60%/0.25)] motion-safe:after:animate-pulse')}
            style={PRIMARY_GRADIENT}
            onClick={onToggle}
            aria-label={t('Start recording')}
            data-testid="capture-mic"
          >
            <Mic className="h-5 w-5" aria-hidden />
            <span className="sm:hidden">{needsShown ? t('Tap to answer') : t('Tap to talk')}</span>
            <span className="hidden sm:inline">{needsShown ? t('Click to answer') : t('Click to talk')}</span>
          </button>
        )}
      </div>
    </div>
  )
}

// Stacked layout — single-mode popup (audio | text | photos) or legacy fullscreen route
function StackedBody({ analyser, isRecording, elapsedMs, ringColorClass, progress, onToggle, descriptionText, setDescriptionText, uploadedPhotos, isUploadingPhotos, photoInputRef, onPhotoFileChange, hasAnyInput, onGenerate, refineMode = false, estimateLanguage, setEstimateLanguage, mode }: RecorderBodyProps) {
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
            className="w-full min-h-[80px] rounded-md border border-field-border bg-field px-3 py-2 text-sm hover:border-field-border-hover placeholder:text-field-placeholder focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40"
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
            data-testid={refineMode ? 'refine-preview-btn' : 'generate-estimate-btn'}
          >
            {refineMode ? t('Preview changes') : t('Generate Estimate')}
          </Button>
        </div>
      )}
    </div>
  )

}

// PhotoThumbnailGrid — per-photo thumbnail strip with uploading / error overlays
// and a remove (×) button. Renders nothing when there are no items.
// singleRow: one horizontally scrolling row (used inside the popup layout,
// where a wrapping grid would grow and push into the regions around it). It
// draws 64px tiles with a 32px remove hit area and, when `onAdd` is given and
// the cap is not reached, a trailing "add" tile with an n/max counter.
export function PhotoThumbnailGrid({
  items,
  onRemove,
  singleRow = false,
  onAdd,
  max = MAX_PHOTOS,
}: {
  items: PhotoItem[]
  onRemove: (id: string) => void
  singleRow?: boolean
  onAdd?: () => void
  max?: number
}) {
  const { t } = useTranslation()
  if (items.length === 0) return null
  return (
    <div className={cn('shrink-0', singleRow ? 'py-0.5' : 'border-t px-3 py-2.5')} data-testid="capture-photo-grid">
      <div className={cn('flex gap-2', singleRow ? 'flex-nowrap overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'flex-wrap')}>
        {items.map(item => (
          <div
            key={item.id}
            className={cn(
              'relative shrink-0 overflow-hidden border border-border bg-muted/30 group',
              singleRow ? 'h-16 w-16 rounded-[14px]' : 'h-14 w-14 rounded-md',
            )}
          >
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
            {singleRow ? (
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label={t('Remove photo')}
                className="absolute right-0 top-0 flex h-8 w-8 items-start justify-end p-[3px]"
                data-testid="capture-remove-photo"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/70 text-background">
                  <X className="h-3.5 w-3.5" aria-hidden />
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label={t('Remove photo')}
                className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-background/80 hover:bg-background flex items-center justify-center shadow"
                data-testid="capture-remove-photo"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {singleRow && onAdd && items.length < max && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={t('Add photos')}
            className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[14px] border-[1.5px] border-dashed border-primary/50 text-[11px] font-medium leading-none tabular-nums text-primary transition-colors hover:bg-primary/5"
            data-testid="capture-add-photo-tile"
          >
            <Plus className="h-[18px] w-[18px]" aria-hidden />
            <span>{items.length}/{max}</span>
          </button>
        )}
      </div>
    </div>
  )
}
