'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { History, Info, Plus, RotateCcw } from 'lucide-react'
import {
  saveEstimate,
  savePresentationSettings,
  createBlankEstimate,
  getEstimateByIdAction,
  getEstimateUpdatedAtAction,
} from '@/lib/actions/estimate'
import { removePhotoFromEstimate } from '@/lib/actions/estimate-photo'
import { translateEstimate } from '@/lib/actions/estimate-translate'
import { renameProjectAction } from '@/lib/actions/project'
import { recordClientResponse } from '@/lib/actions/estimate-response'
import { ClientResponseControl, type ClientResponseValue } from './client-response-control'
import type { EstimateWithSections, Estimate } from '@/lib/queries/estimate'
import type { InvoiceRow } from '@/lib/queries/invoice'
import type { Recording } from '@/lib/queries/recording'
import type { Photo } from '@/lib/queries/photo'
import { useEstimateReducer, type EstimateEditorState } from './use-estimate-reducer'
import { EstimateFloatingActions, type EstimateViewMode } from './estimate-floating-actions'
import { PresentationSettingsPanel } from './presentation-settings-panel'
import { EstimateDebugDialog } from './estimate-debug-dialog'
import { useReviewSummary } from './use-review-summary'
import { mergeReviewQuestions, useSharedEditHint } from './shared-edit-hint'
import type { ReadyToSendReview } from '@/components/workspace/send/ready-to-send-check'
import { editEstimateHref } from '@/lib/estimate/creation-href'
import {
  registerRefineEditor,
  consumePendingRefinement,
  type RefineApplyResult,
} from '@/lib/estimate/refine-bridge'
import type { RefinementPayload } from './use-estimate-reducer'
import { AddBlockRow, blockPrefill, isTextBlock, type AddableBlock } from './add-block-row'
import { IssuedInvoicesPanel } from './issued-invoices-panel'
import { GenerateInvoiceDialog } from './generate-invoice-dialog'
import {
  EstimateDocument,
  type EstimateDocumentData,
  type DocumentClient,
  type DocumentCompany,
  type CompanyDefaults,
} from './estimate-document'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { PriceBookItem } from '@/lib/queries/price-book'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import { usePaginatedPreview } from './use-paginated-preview'
import { PaginatedPreview } from './paginated-preview'
import { DEFAULT_EDIT_LABELS, type EditLabels } from './preview-template/editable'
import { useEstimateVersionSlot } from '@/components/workspace/estimate-version-context'
import { useEditorFrameContext } from '@/components/workspace/editor-frame/context'
import { EditorDock } from '@/components/workspace/editor-frame/editor-dock'
import { EstimateStatusSheet } from '@/components/workspace/editor-frame/estimate-status-sheet'
import { EstimateAnalyticsDrawer } from './analytics/estimate-analytics-drawer'
import { ContractCard, useCreateChangeOrder } from '@/components/workspace/change-orders/contract-card'
import { formatEstimateNumber } from '@/lib/estimate/document/format'
import {
  hasEstimateBeenSentOrViewed,
  type PresentationSettings,
} from '@/lib/estimate/presentation-settings'
import { isEstimateLocked } from '@/lib/estimate/lock'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import { isReloadingForNewBuild, newerBuildIsLive, recoverFromStaleBuild, takeDraft } from '@/lib/deploy/stale-build'
import { useBillingState } from '@/components/billing/billing-state-context'

// ---------------------------------------------------------------------------
// State → EstimateDocumentData converter
// ---------------------------------------------------------------------------

function stateToDocumentData(state: EstimateEditorState): EstimateDocumentData {
  return {
    summary: state.summary,
    notes: state.notes,
    timeline: state.timeline,
    payment_terms: state.payment_terms,
    warranty_terms: state.warranty_terms,
    discount_type: state.discount_type,
    discount_value: state.discount_value,
    discount_amount: state.discount_amount,
    tax_rate: state.tax_rate,
    tax_amount: state.tax_amount,
    subtotal: state.subtotal,
    total: state.total,
    // v4.11 deposit — carry preview into the document surface so the totals
    // panel can render the deposit control + Balance Due line.
    deposit_type: state.deposit_type,
    deposit_value: state.deposit_value,
    deposit: state.deposit,
    balance_due: state.balance_due,
    estimate_date: state.estimate_date,
    estimate_number: state.estimate_number,
    currency_code: state.currency_code,
    // Phase 162-04 (DOCUX-01) — thread raw override state so EstimateDocument
    // resolves section visibility via isSectionVisible(resolvePresentationSettings(...)).
    presentation_settings: state.presentation_settings,
    signature: state.signature,
    attachedPhotos: state.attachedPhotos.map((p) => ({
      id: p.id,
      storage_path: p.storage_path,
      caption: p.caption,
    })),
    sections: state.sections.map((s) => ({
      id: s.id,
      title: s.title,
      subtotal: s.subtotal,
      items: s.items.map((i) => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
        total: i.total,
        sort_order: i.sort_order,
        price_source: i.price_source,
        isManuallyEdited: i.isManuallyEdited,
        // v4.11 advanced pricing — carry through so the document surface can
        // render the per-line discount/taxable controls.
        discount: i.discount ?? 0,
        taxable: i.taxable ?? true,
        tax_category: i.tax_category ?? null,
        cost: i.cost ?? null,
        markup_pct: i.markup_pct ?? null,
        // SEED-057: owner-facing AI confidence dot (edit row only).
        confidence: i.confidence ?? null,
        basis: i.basis ?? null,
      })),
    })),
  }
}

// ---------------------------------------------------------------------------
// Autosave timing
// ---------------------------------------------------------------------------

/** Quiet time after the last edit before autosave runs. */
const AUTOSAVE_DEBOUNCE_MS = 3000
/** A failed save retries after 3 s, 6 s, 12 s ... up to this cap. */
const AUTOSAVE_MAX_BACKOFF_MS = 60_000
/** One error toast per failure streak (a fixed id, so it replaces instead of stacking). */
const SAVE_ERROR_TOAST_ID = 'estimate-save-error'

// ---------------------------------------------------------------------------
// Save payload
// ---------------------------------------------------------------------------

function stateToSavePayload(state: EstimateEditorState, opts?: { baselineUpdatedAt?: string }) {
  return {
    id: state.id,
    // Optimistic-concurrency baseline — see saveEstimate's expectedUpdatedAt doc
    // in lib/actions/estimate.ts. ALWAYS sent: the editor never saves blind.
    // "Keep my changes" (SAVE-05) passes the version it just read from the server
    // (baselineUpdatedAt): the save then overwrites exactly that version, and if
    // it changed again in between the normal conflict path shows up again.
    expectedUpdatedAt: opts?.baselineUpdatedAt ?? state.updated_at,
    summary: state.summary,
    notes: state.notes,
    timeline: state.timeline,
    payment_terms: state.payment_terms,
    warranty_terms: state.warranty_terms,
    // Cast the reducer's wide `string | null` to the editor/DB domain at the
    // boundary (same pattern as deposit_type below) — saveEstimate's zod schema
    // now enforces this domain at runtime too.
    discount_type: state.discount_type as 'percentage' | 'fixed' | null,
    discount_value: state.discount_value,
    // v4.11 deposit — send type+value only; saveEstimate (Plan 01) recomputes
    // balance_due server-side via computeEstimateTotals (server is authoritative).
    // Cast the reducer's wide `string` to the engine/DB-CHECK domain at the boundary.
    deposit_type: state.deposit_type as 'none' | 'percent' | 'amount',
    deposit_value: state.deposit_value,
    tax_rate: state.tax_rate,
    estimate_date: state.estimate_date,
    estimate_number: state.estimate_number,
    // Phase 162-04 (DOCUX-01) — server pass-through for the Phase 161-02 seam.
    // saveEstimate persists this in estimates.presentation_settings JSONB.
    presentation_settings: state.presentation_settings,
    sections: state.sections.map((s) => ({
      id: s.id,
      title: s.title,
      sort_order: s.sort_order,
      items: s.items.map((i) => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
        sort_order: i.sort_order,
        price_source: i.price_source ?? null,
        isManuallyEdited: i.isManuallyEdited,
        // v4.11 advanced pricing — feed the Wave-1 saveEstimate contract
        // (no-op defaults keep an unedited item byte-identical).
        discount: i.discount ?? 0,
        taxable: i.taxable ?? true,
        tax_category: i.tax_category ?? null,
        cost: i.cost ?? null,
        markup_pct: i.markup_pct ?? null,
      })),
    })),
  }
}

// ---------------------------------------------------------------------------
// EstimateEditor
// ---------------------------------------------------------------------------

type SaveStatus = 'idle' | 'saving' | 'saved' | 'dirty' | 'error'

interface EstimateEditorProps {
  estimate: EstimateWithSections
  versions: Estimate[]
  /** Phase 94 (D-19) — issued invoices for this estimate (frozen snapshot amounts). */
  issuedInvoices: InvoiceRow[]
  /**
   * PAYGATE-01/02 — the single forward-looking payment gate (Connect active),
   * computed server-side via `paymentsEnabled(company)`. When false the
   * Generate-invoice affordance must not render AT ALL (no orphan element).
   */
  paymentsEnabled: boolean
  projectId: string
  companyId: string
  companyBrandColor: string | null
  /** Quick-260526-jo4: full company header (logo + contact + address) rendered in the editor. */
  company: DocumentCompany
  /** R4 — company defaults for the override-vs-default indicator. */
  companyDefaults: CompanyDefaults
  /** Phase 185 (PGMODE-02) — resolved design-template id, server-resolved
   *  identically to resolveEstimatePdfContext. Feeds usePaginatedPreview(). */
  estimateTemplateId: EstimateTemplateId
  /** Phase 185 (PGMODE-03) — "Prepared by" value, mirroring the PDF
   *  pipeline's own lookup. Rendered by EstimateDocument in both view modes. */
  preparedBy: string | null
  recordings: Recording[]
  photos: Photo[]
  /** Project context for the document header */
  projectName: string
  projectType: string | null
  client: DocumentClient | null
  linkClientSlot?: React.ReactNode
  /** Opens the Photos dialog (floating-bar affordance). */
  onOpenPhotos?: () => void
  /** Quick-260525-qbc: server-fetched price book for description autocomplete. */
  priceBookItems: PriceBookItem[]
  /**
   * Opens the send dialog. Auto-saves first if there are unsaved changes.
   * Notices review stage 1: hands over the "Ready to send?" snapshot and the
   * actions its rows take (they need the editor).
   */
  onSend?: (check?: SendCheck) => void
  /**
   * Server-resolved platform-admin flag (never derived on the client). When true the
   * floating bar shows the discreet "Estimate debug" button; ai_meta is only present
   * on the estimate for admins.
   */
  isPlatformAdmin?: boolean
  /**
   * Notices review stage 1, part 2: the AI's clarifying questions on a project
   * waiting for details (projects.needs_details). On an estimate that already
   * has content they join the "Edit with AI" questions instead of a banner.
   */
  needsDetailsQuestions?: string[]
}

/** What the Share sheet's "Ready to send?" card shows, and the actions its rows take. */
export interface SendCheck {
  review: ReadyToSendReview
  onFixPrices: () => void
  onAnswerQuestions: () => void
  onAddClient: () => void
}

/**
 * Scroll to the first row that needs a price (or a price check) and open it.
 * The desktop table and the phone list are both in the DOM (CSS picks one),
 * so take the first VISIBLE mark. Waits for the Share sheet to finish closing,
 * which hands focus back to its trigger, before taking focus.
 */
function focusFirstReviewRow() {
  window.setTimeout(() => {
    const target = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="row-price-slot"], [data-testid="row-ai-price-mark"]'),
    ).find((el) => el.offsetParent !== null)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.click()
  }, 450)
}

export function EstimateEditor({
  estimate,
  versions,
  issuedInvoices,
  paymentsEnabled,
  projectId,
  companyBrandColor,
  company,
  companyDefaults,
  estimateTemplateId,
  preparedBy,
  photos,
  projectName,
  projectType,
  client,
  linkClientSlot,
  onOpenPhotos,
  priceBookItems,
  onSend,
  isPlatformAdmin = false,
  needsDetailsQuestions,
}: EstimateEditorProps) {
  const router = useRouter()
  const { t } = useTranslation()
  // Which frame is drawn around the document (components/workspace/editor-frame).
  // v2: the actions live in the docked bar (portalled into the workspace's
  // mount point) and the status sheet replaces the pill's response control.
  // No provider (unit tests, /dev fixtures) means v1: the floating pill.
  const { frame, dockEl } = useEditorFrameContext()
  const [statusOpen, setStatusOpen] = useState(false)
  const openStatus = useCallback(() => setStatusOpen(true), [])
  // Per-estimate analytics drawer. Owned here so the status sheet button and the
  // `?analytics=1` deep link (dashboard) open the same one.
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const openAnalytics = useCallback(() => {
    setStatusOpen(false)
    setAnalyticsOpen(true)
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.get('analytics') !== '1') return
    setAnalyticsOpen(true)
    // Drop the param without a navigation, so a refresh does not reopen it.
    url.searchParams.delete('analytics')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])
  // Platform-admin debug sheet (AI record of this estimate). Closed by default.
  const [debugOpen, setDebugOpen] = useState(false)
  const [state, dispatch] = useEstimateReducer(estimate)
  const stateRef = useRef(state)
  stateRef.current = state

  // A draft stashed because a save failed across a deploy (lib/deploy/stale-build):
  // restore it as unsaved edits so this build saves it. Taken only when the
  // server copy is still the one the draft was based on.
  const draftKey = `estimate:${estimate.id}`
  useEffect(() => {
    const draft = takeDraft<typeof state>(draftKey, estimate.updated_at)
    if (draft && draft.id === estimate.id) dispatch({ type: 'RESTORE_DRAFT', draft })
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [currentVersionId, setCurrentVersionId] = useState(estimate.id)
  const [localProjectName, setLocalProjectName] = useState(projectName)
  // Phase 162-04 (DOCUX-01) — Presentation Settings Panel open/close state,
  // mirroring the existing saveStatus / currentVersionId pattern. Owned here
  // so the panel renders as a sibling of EstimateFloatingActions and can read
  // state.presentation_settings + hasEstimateBeenSentOrViewed at the boundary.
  const [settingsOpen, setSettingsOpen] = useState(false)
  // The floating bar's gear: the desktop settings popover opens anchored to it.
  const settingsGearRef = useRef<HTMLButtonElement>(null)
  // Phase 164 Plan 02 (TRUST-02) — stale-tab latch (Opus warning #3 / audit
  // B6): the CLIENT's own client_response/hasSignature can be stale
  // (another tab/session locked this estimate after THIS tab last loaded it).
  // When the SERVER rejects a save with 'estimate_locked', this latches true
  // so the autosave effect stops re-firing on every keystroke (a plain toast
  // is not enough — that reproduces the audit's toast-storm bug) and the
  // lock banner renders immediately.
  const [lockedByServer, setLockedByServer] = useState(false)
  // Phase 165 Plan 02 (SAVE-05, audit B2/B6) — a genuine optimistic-concurrency
  // conflict (RPC P0002) is NOT terminal like a lock: the user's edits are
  // still sitting unsaved in the editor and must get a non-destructive
  // resolution ("Reload latest" OR "Keep my changes"), never a silent
  // discard. This latch pauses autosave (see its effect below) WITHOUT
  // folding into isContentReadOnly — folding it in would also block runSave's
  // own early-return guard, which would make the "keep mine" retry impossible.
  const [conflictPending, setConflictPending] = useState(false)
  // "Keep my changes" is a one-shot retry SIGNAL (not a boolean): the toast
  // action bumps this counter, and a dedicated effect below reacts to it by
  // reading the server's current version and saving against it. Routing the retry through state+effect
  // (rather than runSave calling itself directly from inside its own
  // useCallback body) avoids a self-referential hook-value cycle entirely.
  const [keepMineRequestId, setKeepMineRequestId] = useState(0)
  // 'estimate_not_current' (RPC P0003) IS terminal — a superseded version is
  // never editable again, so this folds into isContentReadOnly below like a
  // lock (no separate carve-out needed).
  const [notCurrentByServer, setNotCurrentByServer] = useState(false)

  // Phase 185 Plan 02 (PGMODE-01/04) — document viewing mode: 'width' fills
  // the column (default), 'page' centers the document at letter width.
  // Session-only state — resets to 'width' on every mount (DEFER-04 defers
  // persistence; the legacy localStorage-backed mechanism was retired this
  // plan). Published into VersionSlot.viewMode below so the header
  // ViewModeToggle (not this component) renders the actual toggle control.
  const [viewMode, setViewMode] = useState<EstimateViewMode>('width')
  const handleViewModeChange = useCallback((mode: EstimateViewMode) => {
    setViewMode(mode)
  }, [])

  // Phase 185 Plan 03 (PGMODE-02) — memoized so stateToDocumentData(state)
  // only produces a NEW reference on a genuine reducer dispatch (state is a
  // useReducer value, stable across unrelated re-renders) — load-bearing for
  // usePaginatedPreview's dependency array below, not cosmetic: an inline
  // stateToDocumentData(state) call would produce a brand-new object
  // reference on every render, making "did the data actually change"
  // comparisons meaningless.
  const documentData = useMemo(() => stateToDocumentData(state), [state])

  // Phase 185 Plan 03 (PGMODE-02/03) — called UNCONDITIONALLY every render
  // (rules-of-hooks safe); `enabled` internally gates all work (font fetch +
  // engine compute) to when paginated mode is actually active.
  const { pages: paginatedPages } = usePaginatedPreview({
    data: documentData,
    structuralEpoch: state.structuralEditEpoch,
    company,
    templateId: estimateTemplateId,
    preparedBy,
    language: (estimate.language ?? 'en') as EstimateLanguage,
    projectName: localProjectName,
    projectType,
    client,
    estimateSeq: state.estimate_seq,
    estimateCreatedAt: estimate.created_at,
    enabled: viewMode === 'page',
  })

  // Quick 260806-pgv T2 — real page sheets don't fit small viewports; force
  // back to full-width below lg (paginated mode is desktop-only).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(min-width: 1024px)')
    const check = () => {
      if (!mql.matches && viewMode === 'page') setViewMode('width')
    }
    check()
    mql.addEventListener('change', check)
    return () => mql.removeEventListener('change', check)
  }, [viewMode])

  // Phase 193 (193-03) — engagement chip fields, declared on the shared
  // Estimate interface (lib/queries/estimate.ts) alongside the other lifecycle
  // timestamps, so no cast is needed here.
  const engagementFields = estimate

  const isCurrent = state.is_current
  // An accepted, current estimate is the contract: the card above the document
  // lists its change orders and the dock offers "New change order". One create
  // control feeds both so they share a single busy state.
  const showContract = frame === 'v2' && isCurrent && state.client_response === 'accepted'
  const createChangeOrderControl = useCreateChangeOrder(state.id, projectId)
  // Lock coverage mirrors the server guard exactly (saveEstimate / refine
  // route): client_response (accepted or declined) OR an existing signature row (the
  // signed-but-unresponded window — see lib/estimate/lock.ts) OR the latch
  // above once the server has told us so.
  const locked =
    lockedByServer ||
    isEstimateLocked({ client_response: state.client_response }) ||
    state.hasSignature
  // Content lock ≠ display-preferences lock (164-02 PRESENTATION CARVE-OUT):
  // the document/autosave/nav-guards gate on isContentReadOnly, but the gear
  // panel gets its OWN gate below (gearDisabled) so presentation settings
  // stay editable on a locked-but-current estimate.
  // A paywalled free account is read-only on the server (assertCanEdit): the
  // editor says so up front instead of letting every save fail. The paywall
  // banner above explains why. An out-of-credits Pro account may still edit.
  const billingReadOnly = useBillingState() === 'paywalled'
  const isContentReadOnly = !isCurrent || locked || notCurrentByServer || billingReadOnly
  // Notices review stage 1: what still needs a look (rows, AI questions).
  const reviewQuestions = useMemo(
    () => mergeReviewQuestions(state.owner_review?.questions, needsDetailsQuestions),
    [state.owner_review?.questions, needsDetailsQuestions]
  )
  const reviewQuestionsRef = useRef(reviewQuestions)
  reviewQuestionsRef.current = reviewQuestions
  const review = useReviewSummary(state.id, state.sections, reviewQuestions)
  const gearDisabled = !isCurrent
  // Page view's edit chrome (menus, popovers) speaks the app language.
  const editLabels = Object.fromEntries(
    Object.entries(DEFAULT_EDIT_LABELS).map(([key, label]) => [key, t(label)])
  ) as EditLabels

  // -------------------------------------------------------------------------
  // Save handlers
  // -------------------------------------------------------------------------

  // `t` is a fresh function on every render. The save callbacks read it through
  // this ref so runSave keeps a stable identity: a runSave that changed on every
  // render re-armed the autosave timer on every render (an endless 3 s retry loop
  // after a failed save, one toast each time).
  const tRef = useRef(t)
  tRef.current = t

  // The estimate's content version as the editor knows it RIGHT NOW. state.updated_at
  // only catches up after the next render, so an async continuation that runs right
  // after a save (translate after its flush, a second presentation change) would
  // otherwise send the previous version and report a false "changed elsewhere".
  // Written by every save/adopt below; resynced whenever the reducer's value moves.
  const tokenRef = useRef(state.updated_at)
  const seenStateTokenRef = useRef(state.updated_at)
  if (seenStateTokenRef.current !== state.updated_at) {
    seenStateTokenRef.current = state.updated_at
    tokenRef.current = state.updated_at
  }
  const adoptToken = useCallback(
    (token: string) => {
      tokenRef.current = token
      dispatch({ type: 'ADOPT_UPDATED_AT', updated_at: token })
    },
    [dispatch]
  )

  // Autosave failure streak: retries back off (see the autosave effect) and the
  // error toast shows once per streak, not once per attempt.
  const saveFailuresRef = useRef(0)
  const saveErrorToastedRef = useRef(false)
  const [retryTick, setRetryTick] = useState(0)
  const noteSaveFailure = useCallback((message: string) => {
    saveFailuresRef.current += 1
    // Re-runs the autosave effect so the next (longer) retry gets scheduled.
    setRetryTick((n) => n + 1)
    if (!saveErrorToastedRef.current) {
      saveErrorToastedRef.current = true
      toast.error(message, { id: SAVE_ERROR_TOAST_ID })
    }
  }, [])
  const resetSaveFailures = useCallback(() => {
    if (saveFailuresRef.current === 0 && !saveErrorToastedRef.current) return
    const hadToast = saveErrorToastedRef.current
    saveFailuresRef.current = 0
    saveErrorToastedRef.current = false
    if (hadToast) toast.dismiss(SAVE_ERROR_TOAST_ID)
  }, [])

  // While a translation runs nothing may save the pre-translation state over it.
  const [translating, setTranslating] = useState(false)
  const translatingRef = useRef(false)

  const handleDiscard = useCallback(async () => {
    const result = await getEstimateByIdAction(stateRef.current.id)
    if (result.error || !result.data) { toast.error('Failed to reload estimate'); return }
    dispatch({ type: 'INIT', estimate: result.data })
    setSaveStatus('idle')
    // "Reload latest" is the take-theirs exit out of a conflict (SAVE-05) —
    // the fresh INIT above re-baselines updated_at/editEpoch from the server,
    // so the conflict is fully resolved.
    setConflictPending(false)
    resetSaveFailures()
    toast.success('Changes discarded')
  }, [dispatch, resetSaveFailures])

  // Phase 165 Plan 02 (SAVE-05, audit B2/B6) — the ONE non-stacking conflict notice
  // (a fixed `id`: sonner replaces rather than stacks) with TWO non-destructive
  // choices: reload the server's latest (discards this tab's edits, via
  // handleDiscard) or keep this tab's edits (re-reads the server's current version
  // and saves over exactly that one — see the keep-mine effect below). Latches
  // conflictPending, which pauses autosave until the owner decides.
  const showConflictToast = useCallback(
    (message: string) => {
      setConflictPending(true)
      toast.error(message, {
        id: 'estimate-save-conflict',
        duration: Infinity,
        action: {
          label: tRef.current('Keep my changes'),
          // A one-shot request signal, handled by the effect below (runSave never
          // calls itself from inside its own body). conflictPending stays latched
          // until that effect has read the server's version.
          onClick: () => setKeepMineRequestId((n) => n + 1),
        },
        cancel: {
          label: tRef.current('Reload latest'),
          onClick: () => void handleDiscard(),
        },
      })
    },
    [handleDiscard]
  )

  const handleCreateNewVersion = useCallback(async () => {
    const created = await createBlankEstimate(projectId)
    if (created.error || !created.data) {
      toast.error(created.error ?? 'Failed to create new version')
      return
    }
    const loaded = await getEstimateByIdAction(created.data.estimateId)
    if (loaded.error || !loaded.data) {
      toast.error('Failed to load new version')
      return
    }
    setCurrentVersionId(created.data.estimateId)
    dispatch({ type: 'INIT', estimate: loaded.data })
    setSaveStatus('idle')
    setLockedByServer(false)
    setConflictPending(false)
    setNotCurrentByServer(false)
    resetSaveFailures()
    router.refresh()
  }, [projectId, dispatch, router, resetSaveFailures])

  // `baselineUpdatedAt` is for "Keep my changes" only: the version just read from
  // the server. Every other save compares against the version the editor holds.
  const runSave = useCallback(async (opts?: { baselineUpdatedAt?: string }): Promise<boolean> => {
    if (isContentReadOnly || translatingRef.current) return false
    // SAVE-04: capture the edit epoch BEFORE the request goes out. If an edit
    // lands while this await is in flight, the reducer bumps editEpoch again
    // — MARK_SAVED below will then see a mismatch and correctly leave the
    // editor dirty instead of falsely marking it clean (audit B4).
    const savedEpoch = stateRef.current.editEpoch
    setSaveStatus('saving')
    let result: Awaited<ReturnType<typeof saveEstimate>>
    try {
      result = await saveEstimate(
        stateToSavePayload(
          { ...stateRef.current, updated_at: tokenRef.current },
          opts
        )
      )
    } catch {
      // A Server Action from an older build throws (404 after a deploy): keep
      // the draft and reload into the new build instead of losing the edits.
      setSaveStatus('error')
      if (await recoverFromStaleBuild(draftKey, stateRef.current.updated_at, stateRef.current)) return false
      noteSaveFailure(tRef.current('Could not save your changes. Try again.'))
      return false
    }
    if (result.error) {
      setSaveStatus('error')
      // TRUST-02 (Phase 164 Plan 02): the server discovered a lock this tab
      // didn't know about yet (another tab/session sent/signed it since this
      // tab last loaded). Latch immediately — see lockedByServer's doc above.
      if (result.error === 'estimate_locked') {
        resetSaveFailures()
        setLockedByServer(true)
        toast.error(
          tRef.current('The client has already answered this estimate, so it can no longer be edited.')
        )
        return false
      }
      // Phase 165 Plan 02 (SAVE-05, audit B2/B6) — a conflict means the save
      // was REJECTED server-side (another tab/session saved first); local
      // edits are still sitting unsaved in the editor, not lost. A conflict is
      // not a retryable failure: the owner decides, so the backoff streak ends.
      if ('conflict' in result && result.conflict) {
        resetSaveFailures()
        showConflictToast(result.error)
        return false
      }
      // 'estimate_not_current' (RPC P0003) is terminal — a superseded version
      // is never editable again (folded into isContentReadOnly above, like a
      // lock), so there is no autosave loop to guard against here.
      if (result.error === 'estimate_not_current') {
        resetSaveFailures()
        setNotCurrentByServer(true)
        toast.error(tRef.current('This version was superseded; create a new version to keep editing.'))
        return false
      }
      noteSaveFailure(result.error)
      return false
    }
    if (!result.data) return false
    // A save that worked ends the failure streak (and its toast).
    resetSaveFailures()
    tokenRef.current = result.data.updated_at
    // SAVE-03 (id remap) + SAVE-07 (server totals adoption) + SAVE-04
    // (epoch-gated isDirty clear) — see MARK_SAVED's doc in the reducer.
    dispatch({
      type: 'MARK_SAVED',
      updated_at: result.data.updated_at,
      idMap: result.data.id_map,
      totals: {
        subtotal: result.data.subtotal,
        tax_amount: result.data.tax_amount,
        discount_amount: result.data.discount_amount,
        total: result.data.total,
        balance_due: result.data.balance_due,
      },
      savedEpoch,
    })
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2500)
    return true
  }, [isContentReadOnly, dispatch, draftKey, noteSaveFailure, resetSaveFailures, showConflictToast])

  // Phase 165 Plan 02 (SAVE-05) — "Keep my changes": fires exactly ONCE per
  // keepMineRequestId bump (the toast action above); handledKeepMineIdRef
  // (mutated only inside this effect, never during render) guarantees that.
  //
  // It never saves blind: it first reads the estimate's CURRENT version from the
  // server and saves with compare-and-set against THAT value. So it overwrites
  // exactly the version the owner chose to overwrite; if another device saved
  // again in between, runSave's conflict path shows the notice again.
  const handledKeepMineIdRef = useRef(0)
  useEffect(() => {
    if (keepMineRequestId === 0 || keepMineRequestId === handledKeepMineIdRef.current) return
    handledKeepMineIdRef.current = keepMineRequestId
    void (async () => {
      let latest: Awaited<ReturnType<typeof getEstimateUpdatedAtAction>> | null = null
      try {
        latest = await getEstimateUpdatedAtAction(stateRef.current.id)
      } catch {
        latest = null
      }
      if (!latest?.data) {
        showConflictToast(
          tRef.current('Could not check the latest version of this estimate. Try again.')
        )
        return
      }
      setConflictPending(false)
      await runSave({ baselineUpdatedAt: latest.data.updated_at })
    })()
  }, [keepMineRequestId, runSave, showConflictToast])

  // "Edit with AI" bridge (lib/estimate/refine-bridge.ts). The popup that
  // refines this estimate lives outside this tree, so it reaches the editor
  // through a registered handle: flush unsaved edits BEFORE the server refines
  // the persisted row, read live content for the review diff, and apply the
  // reviewed payload (APPLY_REFINEMENT) followed by a save.
  //
  // Apply = dispatch + save. runSave reads stateRef, which only reflects the
  // dispatch after the next render, so the save is requested through a counter
  // and fired from an effect (same pattern as keepMineRequestId above).
  const applyResolveRef = useRef<((r: RefineApplyResult) => void) | null>(null)
  const [applySaveRequestId, setApplySaveRequestId] = useState(0)
  const handledApplySaveIdRef = useRef(0)
  const isContentReadOnlyRef = useRef(isContentReadOnly)
  isContentReadOnlyRef.current = isContentReadOnly

  const applyRefinement = useCallback(
    (refined: RefinementPayload): Promise<RefineApplyResult> => {
      if (isContentReadOnlyRef.current) return Promise.resolve('blocked')
      return new Promise((resolve) => {
        applyResolveRef.current = resolve
        dispatch({ type: 'APPLY_REFINEMENT', refined })
        setApplySaveRequestId((n) => n + 1)
      })
    },
    [dispatch]
  )

  useEffect(() => {
    if (applySaveRequestId === 0 || applySaveRequestId === handledApplySaveIdRef.current) return
    handledApplySaveIdRef.current = applySaveRequestId
    const resolve = applyResolveRef.current
    applyResolveRef.current = null
    void runSave().then((ok) => resolve?.(ok ? 'saved' : 'unsaved'))
  }, [applySaveRequestId, runSave])

  const flushForRefine = useCallback(async () => {
    if (isContentReadOnlyRef.current || !stateRef.current.isDirty) return { ok: true as const }
    const ok = await runSave()
    return ok
      ? { ok: true as const }
      : { ok: false as const, error: t('Could not save your latest edits. Fix that first, then try again.') }
  }, [runSave, t])

  const refineHandlersRef = useRef({ flush: flushForRefine, apply: applyRefinement })
  refineHandlersRef.current = { flush: flushForRefine, apply: applyRefinement }

  useEffect(
    () =>
      registerRefineEditor({
        estimateId: () => stateRef.current.id,
        currencyCode: () => stateRef.current.currency_code,
        getContent: () => {
          const s = stateRef.current
          return {
            sections: s.sections,
            summary: s.summary,
            notes: s.notes,
            timeline: s.timeline,
            payment_terms: s.payment_terms,
            warranty_terms: s.warranty_terms,
          }
        },
        flush: () => refineHandlersRef.current.flush(),
        apply: (refined) => refineHandlersRef.current.apply(refined),
        review: () => ({
          questions: reviewQuestionsRef.current,
          assumptions: stateRef.current.owner_review?.assumptions ?? [],
        }),
      }),
    []
  )

  // Handoff: the popup was applied from a page with no editor mounted; it
  // stored the reviewed payload and navigated here. Consume it once on mount.
  useEffect(() => {
    if (!estimate.is_current) return
    const pending = consumePendingRefinement(estimate.id)
    if (!pending) return
    void refineHandlersRef.current.apply(pending).then((outcome) => {
      if (outcome === 'saved') toast.success(t('AI changes applied'))
      else if (outcome === 'blocked') {
        toast.error(t('This estimate is locked, so it cannot be changed. If the client declined it, use Revise and reopen; if they accepted it, add a change order.'))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Phase 164 Plan 02 (TRUST-02, PRESENTATION CARVE-OUT) — the gear panel's
  // own write path. Live preview ALWAYS dispatches to the reducer (works
  // identically whether locked or not). On a LOCKED estimate the shared
  // isDirty/content-autosave is rejected server-side (and early-returns
  // client-side via isContentReadOnly), so this calls the lock-exempt
  // savePresentationSettings action DIRECTLY instead — decoupled from
  // autosave. On a draft/unlocked estimate this is a no-op beyond the
  // dispatch: presentation_settings continues to ride the normal content
  // save payload (dual-path, unchanged today's behavior).
  // Estimate options -> language: save what is pending, translate on the server
  // (AI, charged as an estimate edit), then reload so every surface (editor,
  // page view, labels) comes back from the translated rows.
  const handleLanguageChange = useCallback(
    async (next: EstimateLanguage) => {
      if (translatingRef.current) return
      if (stateRef.current.isDirty) {
        const ok = await runSave()
        if (!ok) {
          toast.error(t('Save your changes before changing the language.'))
          return
        }
      }
      // From here until the result is applied, autosave and manual saves are
      // paused: a save of the pre-translation state during the multi-second model
      // call would make the server reject the translation (and the owner would
      // pay for nothing), or overwrite it.
      translatingRef.current = true
      setTranslating(true)
      const release = () => {
        translatingRef.current = false
        setTranslating(false)
      }
      let result: Awaited<ReturnType<typeof translateEstimate>>
      try {
        result = await translateEstimate({
          estimateId: stateRef.current.id,
          targetLanguage: next,
          expectedUpdatedAt: tokenRef.current,
        })
      } catch (err) {
        console.warn('[estimate-editor] translate failed:', err)
        release()
        toast.error(t('The translation failed. Nothing was changed. Try again.'))
        // A deploy since this page opened retires its Server Action ids: the
        // edits are already saved, so a plain reload gets the new build.
        if (await newerBuildIsLive()) window.location.reload()
        return
      }
      // The server may have saved the translated texts even when the language
      // flag failed afterwards: adopt that version so the next save is not a
      // false "changed elsewhere".
      if (result.updated_at) adoptToken(result.updated_at)
      if ('error' in result) {
        release()
        toast.error(t(result.error))
        return
      }
      // Autosave stays paused: the page reloads so every surface comes back from
      // the translated rows.
      toast.success(t('Estimate translated'))
      window.location.reload()
    },
    [runSave, t, adoptToken]
  )

  const presentationQueueRef = useRef<Promise<void>>(Promise.resolve())
  const handlePresentationSettingsChange = useCallback(
    (next: PresentationSettings) => {
      // Paywalled: the server refuses this write and content autosave is off,
      // so a change here would show in the preview and vanish on reload.
      if (billingReadOnly) return
      dispatch({ type: 'UPDATE_PRESENTATION_SETTINGS', presentation_settings: next })
      if (locked) {
        // Serialized: each write reads the version the previous one returned
        // (tokenRef), so two quick consecutive changes never send a stale
        // expectedUpdatedAt and conflict against the editor's own write.
        presentationQueueRef.current = presentationQueueRef.current.then(async () => {
          let result: Awaited<ReturnType<typeof savePresentationSettings>>
          try {
            result = await savePresentationSettings(stateRef.current.id, next, tokenRef.current)
          } catch {
            toast.error(tRef.current('Could not save your changes. Try again.'))
            return
          }
          if (result.error) {
            if (result.error === 'estimate_not_current') {
              setNotCurrentByServer(true)
              toast.error(tRef.current('This version was superseded; create a new version to keep editing.'))
              return
            }
            toast.error(result.error)
            return
          }
          // Re-baseline updated_at (and clear the isDirty the dispatch above
          // just set) so the next presentation-only change while locked does not
          // send a now-stale expectedUpdatedAt.
          if (result.data) {
            tokenRef.current = result.data.updated_at
            dispatch({ type: 'MARK_SAVED', updated_at: result.data.updated_at })
          }
        })
      }
    },
    [dispatch, locked, billingReadOnly]
  )

  // SEED-056 Phase D: "+ Add block". Turns ONE block on for this estimate through
  // the same single presentation-settings path as the gear panel (so it also
  // works on locked estimates), pre-fills the text from the company default when
  // the column is still empty (content edits are skipped while read-only), and
  // moves the cursor into the new card.
  const handleAddBlock = useCallback(
    (key: AddableBlock) => {
      const current = stateRef.current
      const raw = current.presentation_settings ?? {}
      handlePresentationSettingsChange({
        ...raw,
        sections: { ...(raw.sections ?? {}), [key]: true },
      })
      const textField = isTextBlock(key) ? key : null
      // Pre-fill only from a non-empty company default; otherwise the column
      // stays null (never an empty string).
      const prefill = blockPrefill(key, current, companyDefaults, isContentReadOnly)
      if (prefill) dispatch({ type: 'UPDATE_FIELD', field: prefill.field, value: prefill.value })
      if (textField) {
        const cardId = {
          summary: 'summary',
          payment_terms: 'terms-payment',
          warranty_terms: 'terms-warranty',
          timeline: 'terms-timeline',
          notes: 'terms-notes',
        }[textField]
        window.setTimeout(() => {
          const box = document.querySelector<HTMLElement>(`[data-page-block-id="${cardId}"] textarea`)
          box?.focus()
        }, 50)
      }
    },
    [handlePresentationSettingsChange, isContentReadOnly, companyDefaults, dispatch]
  )

  const handleSaveDraft = useCallback(async () => {
    const ok = await runSave()
    if (ok) toast.success(t('Saved'))
  }, [runSave, t])

  const handleSend = useCallback(async () => {
    if (!isContentReadOnly && state.isDirty) await runSave()
    if (isContentReadOnly) {
      onSend?.()
      return
    }
    const questions = reviewQuestions
    onSend?.({
      review: {
        unpriced: review.unpriced,
        priceChecks: review.priceChecks,
        pendingQuestions: review.pendingQuestions,
        hadQuestions: questions.length > 0,
        hasClient: !!client?.name?.trim(),
      },
      // Close the sheet (the card does it) and land on the first row to fix.
      onFixPrices: () => focusFirstReviewRow(),
      onAnswerQuestions: () =>
        router.push(editEstimateHref(window.location.search, projectId), { scroll: false }),
      onAddClient: () => setSettingsOpen(true),
    })
  }, [isContentReadOnly, state.isDirty, reviewQuestions, runSave, onSend, review, client, router, projectId])

  // Owner records the client's answer in-app. The server action returns the
  // DB-restamped updated_at; SET_CLIENT_RESPONSE adopts it so the next save
  // does not trip optimistic concurrency. Locked state follows client_response.
  const handleRecordClientResponse = useCallback(
    async (response: ClientResponseValue) => {
      const result = await recordClientResponse(stateRef.current.id, response)
      if (!result.success || !result.data) {
        toast.error(result.error ?? 'Failed to record the response')
        return
      }
      dispatch({
        type: 'SET_CLIENT_RESPONSE',
        client_response: result.data.client_response,
        responded_at: result.data.responded_at,
        updated_at: result.data.updated_at,
      })
      if (response === null) setLockedByServer(false)
      router.refresh()
    },
    [dispatch, router]
  )

  const recordResponseRef = useRef(handleRecordClientResponse)
  recordResponseRef.current = handleRecordClientResponse

  const handleRenameProject = useCallback(async (name: string) => {
    const result = await renameProjectAction(projectId, name)
    if (result.error) {
      // Phase 162-03 (DOCUX-04, Option B) — surface the toast HERE (single
      // user-visible error surface) AND throw so InlineProjectName's catch
      // reverts the draft and keeps edit mode open for retry. The catch in
      // InlineProjectName does NOT re-toast — single-toast rule.
      toast.error(result.error)
      throw new Error(result.error)
    }
    setLocalProjectName(name)
    router.refresh()
  }, [projectId, router])

  const handleDetachPhoto = useCallback(async (photoId: string) => {
    dispatch({ type: 'DETACH_PHOTO', photoId })
    const result = await removePhotoFromEstimate(stateRef.current.id, photoId)
    if ('error' in result) {
      toast.error('Failed to remove photo')
      return
    }
    // Adopt the version the server reports only when this call started from the
    // version the editor holds: if another device saved in between, adopting
    // would hide a real conflict.
    if (result.updated_at && result.previous_updated_at === tokenRef.current) {
      adoptToken(result.updated_at)
    }
  }, [dispatch, adoptToken])

  // cmd/ctrl + S
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isSave = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's'
      if (!isSave) return
      e.preventDefault()
      if (!isContentReadOnly && stateRef.current.isDirty) void handleSaveDraft()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isContentReadOnly, handleSaveDraft])

  // beforeunload guard
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!stateRef.current.isDirty || isContentReadOnly) return
      // Reloading on purpose to save the stashed draft with the new build.
      if (isReloadingForNewBuild()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isContentReadOnly])

  // Pre-launch audit fix (B7) — SPA navigation guard: beforeunload above only
  // covers a full page unload/refresh. Clicking a <Link> (Next.js App Router
  // client-side navigation — the bottom nav, breadcrumbs, etc.) never fires
  // beforeunload, so a user could tap "Projects" and lose unsaved edits with
  // zero warning. Intercept same-origin anchor clicks in the capture phase
  // while dirty; on confirm, re-dispatch the navigation via router.push (the
  // original click was prevented).
  useEffect(() => {
    function onClickCapture(e: MouseEvent) {
      if (isContentReadOnly || !stateRef.current.isDirty) return
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || (anchor.target && anchor.target !== '_self')) return

      let url: URL
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      // Same page (hash-only / query-only jump on the current path) — not a navigation away.
      if (url.pathname === window.location.pathname) return

      e.preventDefault()
      e.stopPropagation()
      if (window.confirm('You have unsaved changes. Leave this page and discard them?')) {
        router.push(url.pathname + url.search + url.hash)
      }
    }
    document.addEventListener('click', onClickCapture, true)
    return () => document.removeEventListener('click', onClickCapture, true)
  }, [isContentReadOnly, router])

  // Autosave (pre-launch audit fix B7): debounced background save while
  // dirty, so edits are persisted within a few seconds of the user stopping
  // typing — a second safety net alongside the explicit Save button, in case
  // the user navigates away (e.g. backgrounds the browser tab on mobile)
  // without tapping Save or triggering the SPA-navigation confirm above.
  useEffect(() => {
    // Phase 165 Plan 02 (Warning 5, SAVE-05) — conflictPending pauses autosave
    // too: a conflicted save must not keep re-firing on every keystroke while
    // the user decides "Reload latest" vs "Keep my changes" (that would just
    // stack more conflicts). Deliberately NOT folded into isContentReadOnly
    // (see conflictPending's own doc above) — runSave's early-return guard
    // stays keyed on isContentReadOnly alone so the "keep mine" retry still
    // works. `translating` pauses it for the duration of a translation.
    if (isContentReadOnly || conflictPending || translating || !state.isDirty) return
    // 3 s debounce normally; after consecutive failures 6 s, 12 s, ... capped at
    // 60 s. The timer is re-armed by every edit (state) and by every failure
    // (retryTick), never by a re-render: runSave is stable.
    const delay = Math.min(AUTOSAVE_DEBOUNCE_MS * 2 ** saveFailuresRef.current, AUTOSAVE_MAX_BACKOFF_MS)
    const timer = setTimeout(() => {
      void runSave()
    }, delay)
    return () => clearTimeout(timer)
    // Intentionally depends on the whole `state` object (not just isDirty) so
    // every edit resets the debounce timer — a genuine debounce. isContentReadOnly
    // already folds in lockedByServer + notCurrentByServer, so a server-discovered
    // lock/supersede stops this effect from scheduling any further save.
    // conflictPending / translating are in the dep array (not just the guard
    // body) so FLIPPING them re-runs this effect and its cleanup cancels any
    // already-scheduled timer.
  }, [state, isContentReadOnly, conflictPending, translating, runSave, retryTick])

  // Back online after a failed save: retry right away instead of waiting out the
  // backoff. Only while a failure streak is open and there is something to save.
  useEffect(() => {
    function onOnline() {
      if (saveFailuresRef.current === 0 || !stateRef.current.isDirty) return
      void runSave()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [runSave])

  // -------------------------------------------------------------------------
  // Version switching
  // -------------------------------------------------------------------------

  const handleVersionChange = useCallback(async (estimateId: string) => {
    if (estimateId === currentVersionId) return
    setCurrentVersionId(estimateId)
    const result = await getEstimateByIdAction(estimateId)
    if (result.error || !result.data) { toast.error('Failed to load version'); return }
    dispatch({ type: 'INIT', estimate: result.data })
    setSaveStatus('idle')
    // The latch is scoped to the PREVIOUS version's server rejection — the
    // freshly loaded version recomputes `locked` from its own
    // client_response/hasSignature, so stale-latch carryover would wrongly
    // lock a version that isn't actually locked. Same reasoning applies to
    // the conflict/not-current latches (Phase 165 Plan 02) — both are scoped
    // to a rejected save against the PREVIOUS version.
    setLockedByServer(false)
    setConflictPending(false)
    setNotCurrentByServer(false)
    resetSaveFailures()
  }, [currentVersionId, dispatch, resetSaveFailures])

  // Push version chrome up to the page header via context
  const { setSlot } = useEstimateVersionSlot()
  const handleVersionChangeRef = useRef(handleVersionChange)
  handleVersionChangeRef.current = handleVersionChange

  const slotSaveStatus = saveStatus === 'dirty' ? 'idle' : (saveStatus as 'idle' | 'saving' | 'saved' | 'error')
  // v2 top bar: "Try again" on a failed save. Not offered when a retry cannot
  // help: read-only content, or a conflict waiting for the user's choice (the
  // conflict toast owns that decision).
  // Through a ref (like handleVersionChangeRef above): runSave's identity changes
  // between renders, and an unstable callback in the slot effect's deps would
  // republish the slot on every render, which re-renders this component: a loop.
  const runSaveRef = useRef(runSave)
  runSaveRef.current = runSave
  const retrySave = useCallback(() => { void runSaveRef.current() }, [])
  // Declined estimate: "Revise and reopen" clears the answer (the decline stays
  // in the activity history) so the content unlocks and the client can answer
  // again on the same link. Same ref pattern as runSave above.
  const reopenEstimate = useCallback(() => { void recordResponseRef.current(null) }, [])
  const canReopen = isCurrent && state.client_response === 'declined' && !state.hasSignature
  const canRetrySave = !isContentReadOnly && !conflictPending
  const estimateNumber = formatEstimateNumber({
    estimate_number: state.estimate_number,
    estimate_seq: state.estimate_seq,
  })

  useEffect(() => {
    setSlot({
      currentVersionId,
      versions,
      version: state.version,
      isDirty: state.isDirty,
      isReadOnly: isContentReadOnly,
      onVersionChange: (id) => handleVersionChangeRef.current(id),
      projectName: localProjectName,
      onProjectRenamed: setLocalProjectName,
      saveStatus: slotSaveStatus,
      viewMode,
      onViewModeChange: handleViewModeChange,
      viewCount: engagementFields.view_count,
      lastViewedAt: engagementFields.last_viewed_at,
      sentAt: state.sent_at,
      hasPassword: engagementFields.share_password_hash != null,
      total: state.total,
      currencyCode: state.currency_code,
      estimateNumber,
      createdAt: estimate.created_at,
      clientResponse: state.client_response,
      respondedAt: state.responded_at,
      hasSignature: state.hasSignature,
      isLocked: isCurrent && locked,
      onRetrySave: canRetrySave ? retrySave : undefined,
      onOpenStatus: openStatus,
      onReopen: canReopen ? reopenEstimate : undefined,
      superseded: notCurrentByServer,
    })
    return () => setSlot(null)
  }, [
    currentVersionId,
    versions,
    state.version,
    state.isDirty,
    isContentReadOnly,
    setSlot,
    localProjectName,
    slotSaveStatus,
    viewMode,
    handleViewModeChange,
    engagementFields.view_count,
    engagementFields.last_viewed_at,
    engagementFields.share_password_hash,
    state.sent_at,
    state.total,
    state.currency_code,
    estimateNumber,
    estimate.created_at,
    state.client_response,
    state.responded_at,
    state.hasSignature,
    isCurrent,
    locked,
    canRetrySave,
    retrySave,
    openStatus,
    canReopen,
    reopenEstimate,
    notCurrentByServer,
  ])

  // Notices review stage 1, part 2: instead of a permanent "Shared with the
  // client" strip, one toast on the first edit after sharing.
  useSharedEditHint({
    estimateId: state.id,
    isDirty: state.isDirty,
    shared:
      isCurrent &&
      !isContentReadOnly &&
      !!(state.sent_at || (engagementFields.view_count ?? 0) > 0) &&
      !state.client_response,
    clientName: client?.name ?? null,
  })

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------


  // One definition, two placements: under the width document, or inside the
  // page view's sheet column (with the zoom control as `leading`).
  // The gear toggles the settings panel, which opens anchored to it.
  const floatingActions = (leading?: ReactNode) => (
    <EstimateFloatingActions
      isCurrent={isCurrent}
      status={slotSaveStatus}
      onSend={handleSend}
      onOpenPhotos={onOpenPhotos}
      onOpenDebug={isPlatformAdmin ? () => setDebugOpen(true) : undefined}
      onOpenSettings={gearDisabled ? undefined : () => setSettingsOpen((open) => !open)}
      settingsButtonRef={settingsGearRef}
      leading={leading}
      // Only once there can be an answer: after the estimate was shared, or
      // when an answer / signature already exists. Before that the button had
      // nothing to record and just crowded the pill.
      responseControl={
        state.sent_at || state.client_response || state.hasSignature ? (
          <ClientResponseControl
            clientResponse={state.client_response}
            respondedAt={state.responded_at}
            signedOnline={state.hasSignature}
            estimateId={state.id}
            disabled={state.isDirty || saveStatus === 'saving'}
            onRecord={handleRecordClientResponse}
          />
        ) : undefined
      }
    />
  )

  return (
    <div className="space-y-3">
      {/* Notices review stage 1: the "Review before sending" box that sat here is
          gone. Its parts live where the action is: marks on the rows, the AI's
          questions in "Edit with AI" (counter on the dock), and a "Ready to
          send?" check in the Share sheet. */}
      {showContract && (
        <ContractCard
          estimateId={state.id}
          projectId={projectId}
          refreshKey={state.updated_at}
          createControl={createChangeOrderControl}
        />
      )}

      {/* The delivered-and-locked banner that used to render here was removed
          — the lock still applies (editor read-only, server guard, toast on a
          rejected save); "Create new version" lives in the header actions. */}

      {/* Phase 165 Plan 02 (SAVE-05, audit B3/RPC P0003) — this tab's belief
          that it holds the current version was WRONG (another tab/session
          superseded it, e.g. via createBlankEstimate) — terminal, like a
          lock: no autosave loop, no further saves possible from this tab. */}
      {/* v1 frame only. v2 (notices review stage 1, part 2): an "Old version"
          chip in the top bar and "Create new version" as the dock's primary. */}
      {frame !== 'v2' && notCurrentByServer && (
        <Alert>
          <History />
          <AlertTitle>{t('This version was superseded')}</AlertTitle>
          <AlertDescription>
            <p>{t('A newer version of this estimate was created elsewhere. Create a new version to keep editing.')}</p>
            <Button size="sm" className="mt-2" onClick={() => void handleCreateNewVersion()}>
              {t('Create new version')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Quick 260806-pgv T2 — 'page' view renders PaginatedPreview, the
          real-page-container view (own internal zoom/thumbnail rail), edited
          in place on the sheets when the content is not read-only; 'width'
          leaves the document filling the column, editable, as before.
          `isolate` pins document-internal z-indexes below the app
          chrome (sticky header, floating action pill). IssuedInvoicesPanel/
          GenerateInvoiceDialog render as SIBLINGS below, in BOTH view modes,
          so unrelated invoice surfaces never sit inside the paginated tray. */}
      {/* The editable 'width' document is always drawn in the standard (Classic)
          layout; only the Page-view preview renders the company's Modern
          template. Say so, and offer the one-click way to see it. Page view is
          desktop-only (the effect above forces 'width' below lg), so the note —
          and its button — only exist at lg+. */}
      {/* v1 frame only. v2 (notices review stage 1, part 2): a dot on the
          dock's "Page" toggle says it, with a tooltip. */}
      {frame !== 'v2' && estimateTemplateId === 'modern' && viewMode === 'width' && (
        <div
          data-testid="modern-layout-note"
          className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {t('Editing in the standard layout. Clients see the Modern template — switch to Page view to see and edit it that way.')}
          </span>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => handleViewModeChange('page')}
          >
            {t('Open Page view')}
          </Button>
        </div>
      )}

      {/* Same --doc-stage backdrop as the public share page, so the white paper
          reads as lifted in light mode too. In dark mode the app background
          already contrasts with the paper, so the stage collapses: --doc-stage
          equals the dark background and --doc-stage-pad is 0. Tokens, not the
          `dark:` variant, because that variant follows the OS color scheme here,
          not the app's .dark class. */}
      <div
        className={`${viewMode === 'page' ? 'isolate w-full' : 'isolate'} rounded-xl bg-[hsl(var(--doc-stage))] p-[var(--doc-stage-pad)]`}
      >
        {viewMode === 'page' ? (
          <PaginatedPreview
            data={documentData}
            pages={paginatedPages}
            company={company}
            templateId={estimateTemplateId}
            language={(estimate.language ?? 'en') as EstimateLanguage}
            brandColor={companyBrandColor ?? undefined}
            client={client}
            projectName={localProjectName}
            projectType={projectType}
            preparedBy={preparedBy}
            estimateVersion={state.version}
            estimateSeq={state.estimate_seq}
            estimateCreatedAt={estimate.created_at}
            companyTerms={{ enabled: company.estimate_terms_enabled ?? false, text: company.estimate_terms_text ?? null }}
            dispatch={isContentReadOnly ? undefined : dispatch}
            priceBookItems={priceBookItems}
            onRenameProject={isContentReadOnly ? undefined : handleRenameProject}
            defaultTaxRate={companyDefaults?.tax_rate}
            onDetachPhoto={isContentReadOnly ? undefined : handleDetachPhoto}
            onOpenClientPanel={gearDisabled ? undefined : () => setSettingsOpen(true)}
            editLabels={editLabels}
            // The action bar lives inside the sheet column here, so it centres
            // on the page; "Add section" leads it. Zoom has its own corner box.
            // v2: the actions are in the docked bar, outside the sheet column.
            bottomBar={frame === 'v2' ? undefined : (leading) => floatingActions(leading)}
          />
        ) : (
          <EstimateDocument
            mode="edit"
            data={documentData}
            company={company}
            companyDefaults={companyDefaults}
            brandColor={companyBrandColor ?? undefined}
            client={client}
            projectName={localProjectName}
            projectType={projectType}
            language={(estimate.language ?? 'en') as EstimateLanguage}
            estimateVersion={state.version}
            estimateSeq={state.estimate_seq}
            estimateCreatedAt={estimate.created_at}
            dispatch={dispatch}
            isReadOnly={isContentReadOnly}
            projectId={projectId}
            onRenameProject={isContentReadOnly ? undefined : handleRenameProject}
            priceBookItems={priceBookItems}
            onDetachPhoto={isContentReadOnly ? undefined : handleDetachPhoto}
            preparedBy={preparedBy}
            companyTerms={{ enabled: company.estimate_terms_enabled ?? false, text: company.estimate_terms_text ?? null }}
          />
        )}
      </div>

      {/* SEED-056 Phase D: hidden blocks, one click away. Same write path as the gear.
          Hidden while paywalled: the server refuses the write. */}
      {isCurrent && !billingReadOnly && (
        <AddBlockRow
          settings={state.presentation_settings}
          hasCompanyTerms={!!(company.estimate_terms_enabled && company.estimate_terms_text)}
          hasValidUntil={!!state.valid_until}
          readOnly={isContentReadOnly}
          content={{
            summary: state.summary,
            payment_terms: state.payment_terms,
            warranty_terms: state.warranty_terms,
            timeline: state.timeline,
            notes: state.notes,
          }}
          onAdd={handleAddBlock}
        />
      )}

      {/* Phase 94 — issued-invoice display (D-19) + generate-invoice action (D-18).
          PAYGATE-02: IssuedInvoicesPanel is a historical RECORD (it returns null
          when there are no invoices), so it stays ungated — a never-connected
          company simply has none. Only the forward-looking Generate-invoice
          affordance below is gated on paymentsEnabled (no orphan when off). */}
      <IssuedInvoicesPanel invoices={issuedInvoices} />

      {isCurrent && paymentsEnabled && !billingReadOnly && (
        <div className="flex justify-end">
          <GenerateInvoiceDialog
            estimateId={estimate.id}
            currencyCode={state.currency_code}
            estimateTotalCents={Math.round(state.total * 100)}
            depositType={state.deposit_type as 'none' | 'percent' | 'amount'}
            depositValue={state.deposit_value}
            onIssued={() => router.refresh()}
          />
        </div>
      )}

      {/* The pill is deliberately minimal: "Refine with AI" is gone (the header's
          "Edit with AI" is the one AI entry point for an existing estimate) and
          Link Client moved into the gear panel below. A wide pill overflowed the
          preview horizontally and made the whole document rock side to side. */}
      {frame !== 'v2' && viewMode !== 'page' && floatingActions()}

      {/* Editor frame v2: the same actions, docked. The pill's "Client response"
          control moved into the status sheet (opened from the top bar's chip). */}
      {frame === 'v2' && isCurrent && dockEl &&
        createPortal(
          <EditorDock
            projectId={projectId}
            saving={slotSaveStatus === 'saving'}
            locked={isContentReadOnly}
            onShare={handleSend}
            onOpenPhotos={onOpenPhotos}
            onOpenSettings={gearDisabled ? undefined : () => setSettingsOpen((open) => !open)}
            settingsButtonRef={settingsGearRef}
            onOpenDebug={isPlatformAdmin ? () => setDebugOpen(true) : undefined}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            aiBadge={isContentReadOnly ? 0 : review.pendingQuestions.length}
            pageHint={
              estimateTemplateId === 'modern'
                ? t('Clients see the Modern template. Page view shows it that way.')
                : undefined
            }
            primary={
              notCurrentByServer
                ? {
                    label: t('Create new version'),
                    icon: <History size={18} />,
                    onClick: () => void handleCreateNewVersion(),
                    testId: 'create-new-version-btn',
                  }
                : showContract
                ? {
                    label: t('New change order'),
                    icon: <Plus size={18} />,
                    onClick: createChangeOrderControl.create,
                    busy: createChangeOrderControl.creating,
                    testId: 'new-change-order-btn',
                  }
                : canReopen
                ? {
                    label: t('Revise and reopen'),
                    icon: <RotateCcw size={18} />,
                    onClick: reopenEstimate,
                    testId: 'revise-and-reopen-btn',
                  }
                : undefined
            }
          />,
          dockEl,
        )}
      {frame === 'v2' && (
        <EstimateStatusSheet
          open={statusOpen}
          onOpenChange={setStatusOpen}
          estimateId={state.id}
          createdAt={estimate.created_at}
          sentAt={state.sent_at}
          viewCount={engagementFields.view_count}
          lastViewedAt={engagementFields.last_viewed_at}
          clientResponse={state.client_response}
          respondedAt={state.responded_at}
          signedOnline={state.hasSignature}
          recordDisabled={!isCurrent || state.isDirty || saveStatus === 'saving'}
          onRecord={handleRecordClientResponse}
          onOpenAnalytics={openAnalytics}
        />
      )}
      <EstimateAnalyticsDrawer open={analyticsOpen} onOpenChange={setAnalyticsOpen} estimateId={state.id} />

      {/* Platform-admin only; outside the document stage, so never part of the page view,
          the share page, a PDF or a message. */}
      {isPlatformAdmin && (
        <EstimateDebugDialog
          open={debugOpen}
          onOpenChange={setDebugOpen}
          estimate={estimate}
          projectId={projectId}
        />
      )}

      {/* Phase 162-04 (DOCUX-01) — the ONE presentation-settings write path.
          Phase 164 Plan 02 (TRUST-02 carve-out): the gear panel's OWN gate is
          `!isCurrent` (gearDisabled) — NOT isContentReadOnly — so it stays
          enabled on a locked-but-current estimate. handlePresentationSettingsChange
          always dispatches (live preview) and additionally calls the
          lock-exempt savePresentationSettings action directly when locked. */}
      {isCurrent && (
        <PresentationSettingsPanel
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={state.presentation_settings}
          onChange={handlePresentationSettingsChange}
          defaultTaxRate={state.tax_rate}
          estimateSentOrViewed={hasEstimateBeenSentOrViewed({
            sent_at: estimate.sent_at,
            viewed_at: estimate.viewed_at,
          })}
          clientSlot={linkClientSlot}
          anchorRef={settingsGearRef}
          hasCompanyTerms={!!(company.estimate_terms_enabled && company.estimate_terms_text)}
          hasValidUntil={!!state.valid_until}
          language={(estimate.language ?? 'en') as EstimateLanguage}
          onLanguageChange={handleLanguageChange}
          languageDisabled={isContentReadOnly}
          readOnly={billingReadOnly}
        />
      )}
    </div>
  )
}
