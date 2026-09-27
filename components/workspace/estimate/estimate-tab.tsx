'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { createBlankEstimate } from '@/lib/actions/estimate'
import type { EstimateWithSections, Estimate } from '@/lib/queries/estimate'
import type { InvoiceRow } from '@/lib/queries/invoice'
import type { Recording } from '@/lib/queries/recording'
import type { Photo } from '@/lib/queries/photo'
import { Skeleton } from '@/components/ui/skeleton'
import { EstimateEditor } from './estimate-editor'
// Phase 163-04 (SENDHUB-01/-06): the format-first hub replaces the retired
// channel-first dialog. Same dialog-open state slot, same prop shape + 2
// new optional props (companySlug, whatsappEnabled) threaded below.
import { SendHubDialog } from '@/components/workspace/send/send-hub-dialog'
import {
  popStoredClientSuggestion,
  showClientSuggestionToast,
} from './client-suggestion-toast'
import { useWakeLock } from '@/hooks/use-wake-lock'
import { useBackgroundGeneration } from '@/hooks/use-background-generations'
import { removeBackgroundGeneration } from '@/lib/estimate/background-generations'
import { useAttemptProgress, type AttemptProgressSnapshot } from '@/hooks/use-attempt-progress'
import { CaptureProcessingOverlay } from '@/components/capture/capture-processing-overlay'
import { GenerationProgressBanner } from '@/components/capture/generation-progress-banner'
import type { CaptureProgressMode } from '@/lib/estimate/progress-model'
import type { DocumentClient, DocumentCompany, CompanyDefaults } from './estimate-document'
import type { PriceBookItem } from '@/lib/queries/price-book'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'

/**
 * 260927: which checklist rows apply to a generation this tab did not start.
 * The stored mode wins; otherwise the journal says (a transcribe row means
 * audio, an analyze row means photos).
 */
function inferMode(
  stored: CaptureProgressMode | undefined,
  progress: AttemptProgressSnapshot | null,
  fallback: CaptureProgressMode
): CaptureProgressMode {
  if (stored) return stored
  const steps = new Set([
    ...(progress?.completedSteps ?? []),
    ...(progress?.stepTimings ?? []).map((s) => s.step),
  ])
  if (steps.has('transcribe')) return 'audio'
  if (steps.has('analyze')) return 'photos'
  return fallback
}

interface EstimateTabProps {
  projectId: string
  companyId: string
  companyBrandColor: string | null
  company: DocumentCompany
  companyDefaults: CompanyDefaults
  currentEstimate: EstimateWithSections | null
  allVersions: Estimate[]
  issuedInvoices: InvoiceRow[]
  /** PAYGATE-01/02 — forward-looking payment gate (Connect active), forwarded to the editor. */
  paymentsEnabled: boolean
  recordings: Recording[]
  photos: Photo[]
  projectName: string
  projectType: string | null
  client: DocumentClient | null
  linkClientSlot?: React.ReactNode
  onOpenPhotos?: () => void
  priceBookItems: PriceBookItem[]
  companyName: string
  ownerName: string
  estimateTemplate: EstimateTemplate
  /** Phase 185 (PGMODE-02) — forwarded to EstimateEditor's usePaginatedPreview hook. */
  estimateTemplateId: EstimateTemplateId
  /** Phase 185 (PGMODE-03) — forwarded to EstimateEditor. */
  preparedBy: string | null
  smsDeliveryEnabled?: boolean
  /**
   * Phase 163-04 (SENDHUB-01): company slug for buildEstimatePublicPath in the
   * hub's Online Estimate card. Optional here -- when the parent chain
   * (OverviewTab -> ProjectWorkspace -> page.tsx) hasn't threaded it yet,
   * buildEstimatePublicPath falls back to the legacy /estimate/{share_token}
   * path. Wired end-to-end in 163-05 once the delivery-action buttons need
   * real URLs.
   */
  companySlug?: string | null
  /**
   * Phase 163 (SENDHUB): server-resolved WhatsApp availability (tier
   * entitlement ∧ active account-registry status), threaded down from the
   * project page and forwarded to the Send hub so WhatsApp actions hide when
   * the channel is unavailable. Optional; when the parent omits it the hub
   * defaults to showing the buttons.
   */
  whatsappEnabled?: boolean
}

export function EstimateTab({
  projectId,
  companyId,
  companyBrandColor,
  company,
  companyDefaults,
  currentEstimate,
  allVersions,
  issuedInvoices,
  paymentsEnabled,
  recordings,
  photos,
  projectName,
  projectType,
  client,
  linkClientSlot,
  onOpenPhotos,
  priceBookItems,
  companyName,
  ownerName,
  estimateTemplate,
  estimateTemplateId,
  preparedBy,
  smsDeliveryEnabled,
  companySlug,
  whatsappEnabled,
}: EstimateTabProps) {
  const [sendOpen, setSendOpen] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const blankFiredRef = useRef(false)

  // True when the user navigated here right after stopping a recording —
  // the pipeline is running server-side (Inngest) and we poll until the
  // estimate appears, then clear the param.
  const isAutoGenerating = searchParams.get('autoGenerating') === 'true'

  // 260927: the generation this tab can narrate. Either the inline recorder
  // passed its attempt in the URL, or the operator left a capture running
  // (lib/estimate/background-generations.ts). Either way the tab reads the
  // journal directly and shows the same checklist as the capture popup.
  const attemptParam = searchParams.get('attempt')
  const backgroundGeneration = useBackgroundGeneration(projectId)
  const watchedAttemptId = attemptParam ?? backgroundGeneration?.attemptId ?? null
  const { state: attemptState, medians: attemptMedians } = useAttemptProgress(watchedAttemptId)
  const attemptOutcome = attemptState.outcome
  const attemptGaveUp = attemptState.gaveUp
  const generationRunning = !!watchedAttemptId && !attemptOutcome && !attemptGaveUp

  // 260927: an attempt this tab cannot narrate (another company's, or one the
  // journal never heard of) must not pin the tab on a checklist forever. Drop
  // it from the URL and from the background store, then behave as if nothing
  // were generating.
  useEffect(() => {
    if (!attemptGaveUp || !watchedAttemptId) return
    removeBackgroundGeneration(watchedAttemptId)
    if (!attemptParam && !isAutoGenerating) return
    const params = new URLSearchParams(searchParams.toString())
    params.delete('autoGenerating')
    params.delete('attempt')
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }, [attemptGaveUp, watchedAttemptId, attemptParam, isAutoGenerating, searchParams, pathname, router])

  // A terminal outcome for the watched attempt. Completed: refresh so the new
  // estimate renders. Needs details / failed: drop the waiting params so the
  // tab falls back to an editable estimate; the app-shell watcher already
  // says what happened.
  useEffect(() => {
    if (!attemptOutcome) return
    if (attemptOutcome.state === 'completed') {
      router.refresh()
      return
    }
    if (!isAutoGenerating && !attemptParam) return
    const params = new URLSearchParams(searchParams.toString())
    params.delete('autoGenerating')
    params.delete('attempt')
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }, [attemptOutcome, isAutoGenerating, attemptParam, searchParams, pathname, router])

  // Legacy fallback: an autoGenerating link with no attempt to read. The
  // estimate only becomes visible through an RSC refetch, so refresh with a
  // gentle backoff until it lands.
  useEffect(() => {
    if (!isAutoGenerating || currentEstimate || watchedAttemptId) return
    let cancelled = false
    let delay = 2000
    const MAX_DELAY = 10000
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      if (cancelled) return
      router.refresh()
      delay = Math.min(Math.round(delay * 1.5), MAX_DELAY)
      timer = setTimeout(tick, delay)
    }
    timer = setTimeout(tick, delay)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isAutoGenerating, currentEstimate, watchedAttemptId, router])

  useEffect(() => {
    if (!(isAutoGenerating || attemptParam) || !currentEstimate) return
    // Keep watching a regeneration: an existing estimate does not mean THIS
    // attempt finished. Clear the params once it has.
    if (generationRunning) return
    const params = new URLSearchParams(searchParams.toString())
    params.delete('autoGenerating')
    params.delete('attempt')
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }, [isAutoGenerating, attemptParam, generationRunning, currentEstimate, searchParams, pathname, router])

  // Lazy materialization — a project with no estimate and no in-flight AI
  // generation should simply BE a blank, editable estimate (not an empty-state
  // chooser). Create the blank once, then refresh so the editor renders. Gated
  // on !isAutoGenerating so this never races the AI-generation path (which
  // creates the estimate itself). createBlankEstimate is idempotent as a
  // backstop against a double-fire.
  // 260927: also held while a watched generation runs or has just completed
  // (its estimate is about to arrive with the refresh), so the tab never
  // materializes a blank the generation would then have to replace.
  const waitingForGeneration =
    (isAutoGenerating && !attemptOutcome && !attemptGaveUp) ||
    generationRunning ||
    attemptOutcome?.state === 'completed'
  useEffect(() => {
    if (currentEstimate || waitingForGeneration || blankFiredRef.current) return
    blankFiredRef.current = true
    createBlankEstimate(projectId).then((result) => {
      if (result.error) {
        toast.error(result.error)
        blankFiredRef.current = false // allow a retry on the next render
        return
      }
      router.refresh()
    })
  }, [currentEstimate, waitingForGeneration, projectId, router])

  useEffect(() => {
    const suggestion = popStoredClientSuggestion(projectId)
    if (suggestion) {
      queueMicrotask(() => {
        showClientSuggestionToast({ projectId, router, suggestion })
      })
    }
  }, [projectId, router])

  // The auto-generating screen is a pure wait — the user watches it without
  // touching the phone, so the OS idle timer would otherwise blank the screen
  // mid-generation. Must sit above the early returns below (hook order).
  useWakeLock(waitingForGeneration && !currentEstimate)

  const generationMode = inferMode(
    backgroundGeneration?.mode,
    attemptState.progress,
    isAutoGenerating ? 'audio' : 'text'
  )

  if (waitingForGeneration && !currentEstimate) {
    if (watchedAttemptId) {
      // 260927: the same journal-driven checklist as the capture popup,
      // instead of three bouncing dots and one static label.
      const progress = attemptState.progress
      return (
        <div className="py-6" data-testid="estimate-tab-generating">
          <CaptureProcessingOverlay
            layout="inline"
            stage={attemptOutcome?.state === 'completed' ? 'done' : 'generating'}
            mode={generationMode}
            completedSteps={progress?.completedSteps ?? []}
            activeStep={progress?.activeStep ?? null}
            activeStepStartedAt={progress?.activeStepStartedAt ?? null}
            stepTimings={progress?.stepTimings}
            phaseVisits={progress?.phaseVisits}
            analyzedCount={progress?.analyzedCount}
            totalCount={progress?.totalCount}
            failedCount={progress?.failedCount}
            medians={attemptMedians}
            showLeaveHint
          />
        </div>
      )
    }
    const hasTranscript = recordings.some(r => r.transcript && r.transcript.trim().length > 0)
    return (
      <div className="relative py-24" data-testid="estimate-tab-generating">
        <CaptureProcessingOverlay layout="inline" stage={hasTranscript ? 'generating' : 'transcribing'} />
      </div>
    )
  }

  if (currentEstimate) {
    return (
      <>
        {generationRunning && (
          <GenerationProgressBanner
            mode={generationMode}
            progress={attemptState.progress}
            medians={attemptMedians}
          />
        )}
        <EstimateEditor
          estimate={currentEstimate}
          versions={allVersions}
          issuedInvoices={issuedInvoices}
          paymentsEnabled={paymentsEnabled}
          projectId={projectId}
          companyId={companyId}
          companyBrandColor={companyBrandColor}
          company={company}
          companyDefaults={companyDefaults}
          recordings={recordings}
          photos={photos}
          projectName={projectName}
          projectType={projectType}
          client={client}
          linkClientSlot={linkClientSlot}
          onOpenPhotos={onOpenPhotos}
          priceBookItems={priceBookItems}
          onSend={() => setSendOpen(true)}
          estimateTemplateId={estimateTemplateId}
          preparedBy={preparedBy}
        />
        <SendHubDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          estimate={currentEstimate}
          projectName={projectName}
          companyName={companyName}
          companySlug={companySlug ?? null}
          clientEmail={client?.email ?? null}
          clientPhone={client?.phone ?? null}
          clientName={client?.name ?? ''}
          ownerName={ownerName}
          estimateTemplate={estimateTemplate}
          smsDeliveryEnabled={smsDeliveryEnabled ?? false}
          whatsappEnabled={whatsappEnabled}
        />
      </>
    )
  }

  // No estimate yet — the lazy effect above is creating a blank one. Show a brief
  // skeleton mirroring the estimate document until the refresh swaps in the editor.
  return (
    <div className="space-y-4" aria-busy>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-start justify-between gap-4 p-5">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-12 w-12 rounded-md" />
        </div>
        <Skeleton className="h-10 w-full rounded-none" />
        <div className="p-5 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="border-t border-border px-5 py-4 space-y-3">
          <Skeleton className="h-4 w-44" />
          {Array.from({ length: 2 }).map((_, r) => (
            <div key={r} className="flex items-center gap-3">
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
