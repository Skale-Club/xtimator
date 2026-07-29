'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Lock, History, Minus, Plus } from 'lucide-react'
import {
  saveEstimate,
  savePresentationSettings,
  createBlankEstimate,
  getEstimateByIdAction,
} from '@/lib/actions/estimate'
import { removePhotoFromEstimate } from '@/lib/actions/estimate-photo'
import { renameProjectAction } from '@/lib/actions/project'
import type { EstimateWithSections, Estimate } from '@/lib/queries/estimate'
import type { InvoiceRow } from '@/lib/queries/invoice'
import type { Recording } from '@/lib/queries/recording'
import type { Photo } from '@/lib/queries/photo'
import { useEstimateReducer, type EstimateEditorState } from './use-estimate-reducer'
import { EstimateFloatingActions, type EstimateViewMode } from './estimate-floating-actions'
import { RefineEstimateDialog } from './refine-estimate-dialog'
import { PresentationSettingsPanel } from './presentation-settings-panel'
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
import { PaginatedDocumentOverlay } from './paginated-document-overlay'
import { LETTER_HEIGHT_PX, LETTER_WIDTH_PX } from '@/lib/estimate/document/tokens'
import { useEstimateVersionSlot } from '@/components/workspace/estimate-version-context'
import {
  hasEstimateBeenSentOrViewed,
  type PresentationSettings,
} from '@/lib/estimate/presentation-settings'
import { isEstimateLocked } from '@/lib/estimate/lock'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'

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
      })),
    })),
  }
}

// ---------------------------------------------------------------------------
// Save payload
// ---------------------------------------------------------------------------

function stateToSavePayload(state: EstimateEditorState, opts?: { force?: boolean }) {
  return {
    id: state.id,
    // Pre-launch audit fix (B7): optimistic-concurrency baseline — see
    // saveEstimate's expectedUpdatedAt doc in lib/actions/estimate.ts.
    // Phase 165 Plan 02 (SAVE-05, "Keep my changes"): omitting this field
    // entirely (force:true) makes saveEstimate coalesce it to null
    // (`estimateData.expectedUpdatedAt ?? null`), which the RPC's own guard
    // (`p_expected_updated_at IS NULL`) treats as "skip the compare-and-set" —
    // last-writer-wins on content, saving the CURRENT user's full editor
    // payload. This is an explicit, non-destructive-to-the-current-user's-work
    // choice (it overwrites whatever the OTHER tab/session saved).
    expectedUpdatedAt: opts?.force ? undefined : state.updated_at,
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

// (260728 rework) The old LETTER_PAGE_HEIGHT/PAGE_FIT_CLEARANCE height-fit
// constants were retired with the fit-to-width zoom model — LETTER_HEIGHT_PX
// stays imported for the overlay/geometry consumers below.

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
   *  identically to resolveEstimatePdfContext. Feeds usePaginatedPreview()
   *  (Task 2) and EstimateDocument's pageView measurement. */
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
  /** Opens the send dialog. Auto-saves first if there are unsaved changes. */
  onSend?: () => void
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
}: EstimateEditorProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const [state, dispatch] = useEstimateReducer(estimate)
  const stateRef = useRef(state)
  stateRef.current = state

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [currentVersionId, setCurrentVersionId] = useState(estimate.id)
  const [localProjectName, setLocalProjectName] = useState(projectName)
  // Phase 162-04 (DOCUX-01) — Presentation Settings Panel open/close state,
  // mirroring the existing saveStatus / currentVersionId pattern. Owned here
  // so the panel renders as a sibling of EstimateFloatingActions and can read
  // state.presentation_settings + hasEstimateBeenSentOrViewed at the boundary.
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Phase 164 Plan 02 (TRUST-02) — stale-tab latch (Opus warning #3 / audit
  // B6): the CLIENT's own sent_at/client_response/hasSignature can be stale
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
  // calling runSave({force:true}). Routing the retry through state+effect
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
    enabled: viewMode === 'page',
  })

  // Quick-260718-w4k — page mode fits the WHOLE letter sheet in the visible
  // viewport (print-preview fit) via CSS zoom. Measured, not fixed: available
  // height = viewport bottom − sheet top − pill clearance. The sheet top is
  // clamped to the scroll container's top (<main>) so toggling mid-scroll
  // doesn't measure a negative offset. Capped at 1 (no upscaling), floored
  // at 0.45 (never unreadably small). Recomputes on window resize.
  // Phase 185 Plan 03 (185-UI-SPEC.md §4) — widened to also gate on
  // available WIDTH (not height-only), so the paginated canvas scales down
  // on narrower viewports instead of clipping/scrolling horizontally.
  // `+ 32` mirrors the canvas wrapper's own px-4 (16px) horizontal padding
  // on each side (PaginatedDocumentOverlay).
  const pageWrapRef = useRef<HTMLDivElement | null>(null)
  const [pageZoom, setPageZoom] = useState(1)
  // Paginated-preview presentation rework (260728): the document is the hero.
  // Auto zoom now fits the sheet WIDTH (like a PDF viewer's fit-width), never
  // the whole page height — the old height-fit shrank the letter sheet to
  // ~56% on common laptop viewports, reading as a thumbnail. Manual zoom
  // (the −/+ controls below) overrides auto-fit until "Fit" resets it.
  const [zoomOverride, setZoomOverride] = useState<number | null>(null)
  useEffect(() => {
    if (viewMode !== 'page') {
      setPageZoom(1)
      setZoomOverride(null)
      return
    }
    const compute = () => {
      const el = pageWrapRef.current
      if (!el) return
      const availWidth = el.getBoundingClientRect().width || window.innerWidth
      setPageZoom(Math.min(1, Math.max(availWidth / (LETTER_WIDTH_PX + 32), 0.45)))
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [viewMode])
  const effectiveZoom = zoomOverride ?? pageZoom
  const zoomStep = (delta: number) =>
    setZoomOverride((prev) => {
      const base = prev ?? pageZoom
      return Math.min(1.5, Math.max(0.5, Math.round((base + delta) * 10) / 10))
    })

  const isCurrent = state.is_current
  // Lock coverage mirrors the server guard exactly (saveEstimate / refine
  // route): sent_at OR client_response OR an existing signature row (the
  // signed-but-unresponded window — see lib/estimate/lock.ts) OR the latch
  // above once the server has told us so.
  const locked =
    lockedByServer ||
    isEstimateLocked({ sent_at: state.sent_at, client_response: state.client_response }) ||
    state.hasSignature
  // Content lock ≠ display-preferences lock (164-02 PRESENTATION CARVE-OUT):
  // the document/autosave/nav-guards gate on isContentReadOnly, but the gear
  // panel gets its OWN gate below (gearDisabled) so presentation settings
  // stay editable on a locked-but-current estimate.
  const isContentReadOnly = !isCurrent || locked || notCurrentByServer
  const gearDisabled = !isCurrent

  // -------------------------------------------------------------------------
  // Save handlers
  // -------------------------------------------------------------------------

  const handleDiscard = useCallback(async () => {
    const result = await getEstimateByIdAction(stateRef.current.id)
    if (result.error || !result.data) { toast.error('Failed to reload estimate'); return }
    dispatch({ type: 'INIT', estimate: result.data })
    setSaveStatus('idle')
    // "Reload latest" is the take-theirs exit out of a conflict (SAVE-05) —
    // the fresh INIT above re-baselines updated_at/editEpoch from the server,
    // so the conflict is fully resolved.
    setConflictPending(false)
    toast.success('Changes discarded')
  }, [dispatch])

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
    router.refresh()
  }, [projectId, dispatch, router])

  const runSave = useCallback(async (opts?: { force?: boolean }): Promise<boolean> => {
    if (isContentReadOnly) return false
    // SAVE-04: capture the edit epoch BEFORE the request goes out. If an edit
    // lands while this await is in flight, the reducer bumps editEpoch again
    // — MARK_SAVED below will then see a mismatch and correctly leave the
    // editor dirty instead of falsely marking it clean (audit B4).
    const savedEpoch = stateRef.current.editEpoch
    setSaveStatus('saving')
    const result = await saveEstimate(stateToSavePayload(stateRef.current, opts))
    if (result.error) {
      setSaveStatus('error')
      // TRUST-02 (Phase 164 Plan 02): the server discovered a lock this tab
      // didn't know about yet (another tab/session sent/signed it since this
      // tab last loaded). Latch immediately — see lockedByServer's doc above.
      if (result.error === 'estimate_locked') {
        setLockedByServer(true)
        toast.error(
          t('This estimate was delivered to the client and is now locked. Create a new version to keep editing.')
        )
        return false
      }
      // Phase 165 Plan 02 (SAVE-05, audit B2/B6) — a conflict means the save
      // was REJECTED server-side (another tab/session saved first); local
      // edits are still sitting unsaved in the editor, not lost. Latch
      // conflictPending (pauses autosave — see its effect below) and surface
      // exactly ONE non-stacking notice (a fixed `id` — sonner replaces
      // rather than stacks) with TWO non-destructive choices: reload the
      // server's latest (destructive to the CURRENT tab's edits, via the
      // existing handleDiscard plumbing) or keep this tab's edits (retries
      // the save with force:true — see stateToSavePayload's doc). Never a
      // silent discard either way.
      if ('conflict' in result && result.conflict) {
        setConflictPending(true)
        toast.error(result.error, {
          id: 'estimate-save-conflict',
          duration: Infinity,
          action: {
            label: t('Keep my changes'),
            onClick: () => {
              setConflictPending(false)
              // Bumps the retry-request effect below (never calls runSave
              // directly from inside runSave's own body — see keepMineRequestId's doc).
              setKeepMineRequestId((n) => n + 1)
            },
          },
          cancel: {
            label: t('Reload latest'),
            onClick: () => void handleDiscard(),
          },
        })
        return false
      }
      // 'estimate_not_current' (RPC P0003) is terminal — a superseded version
      // is never editable again (folded into isContentReadOnly above, like a
      // lock), so there is no autosave loop to guard against here.
      if (result.error === 'estimate_not_current') {
        setNotCurrentByServer(true)
        toast.error(t('This version was superseded; create a new version to keep editing.'))
        return false
      }
      toast.error(result.error)
      return false
    }
    if (!result.data) return false
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
  }, [isContentReadOnly, dispatch, handleDiscard, t])

  // Phase 165 Plan 02 (SAVE-05) — "Keep my changes": fires runSave({force:true})
  // exactly ONCE per keepMineRequestId bump (the toast action above). `t`
  // (useTranslation) is not memoized, so `runSave` gets a new identity on
  // every render — this effect WILL re-run more often than the id itself
  // changes; handledKeepMineIdRef (mutated only inside this effect, never
  // during render) is what guarantees the actual save call fires once per
  // request, not once per re-render.
  const handledKeepMineIdRef = useRef(0)
  useEffect(() => {
    if (keepMineRequestId === 0 || keepMineRequestId === handledKeepMineIdRef.current) return
    handledKeepMineIdRef.current = keepMineRequestId
    void runSave({ force: true })
  }, [keepMineRequestId, runSave])

  // Phase 164 Plan 02 (TRUST-02, PRESENTATION CARVE-OUT) — the gear panel's
  // own write path. Live preview ALWAYS dispatches to the reducer (works
  // identically whether locked or not). On a LOCKED estimate the shared
  // isDirty/content-autosave is rejected server-side (and early-returns
  // client-side via isContentReadOnly), so this calls the lock-exempt
  // savePresentationSettings action DIRECTLY instead — decoupled from
  // autosave. On a draft/unlocked estimate this is a no-op beyond the
  // dispatch: presentation_settings continues to ride the normal content
  // save payload (dual-path, unchanged today's behavior).
  const handlePresentationSettingsChange = useCallback(
    (next: PresentationSettings) => {
      dispatch({ type: 'UPDATE_PRESENTATION_SETTINGS', presentation_settings: next })
      if (locked) {
        void savePresentationSettings(stateRef.current.id, next, stateRef.current.updated_at).then(
          (result) => {
            if (result.error) {
              toast.error(result.error)
              return
            }
            // Re-baseline updated_at (and clear the isDirty the dispatch above
            // just set) so a SECOND consecutive presentation-only change while
            // locked doesn't send a now-stale expectedUpdatedAt and spuriously
            // conflict against the write this call just made.
            if (result.data) {
              dispatch({ type: 'MARK_SAVED', updated_at: result.data.updated_at })
            }
          }
        )
      }
    },
    [dispatch, locked]
  )

  const handleSaveDraft = useCallback(async () => {
    const ok = await runSave()
    if (ok) toast.success('Draft saved')
  }, [runSave])

  const handleSend = useCallback(async () => {
    if (!isContentReadOnly && state.isDirty) await runSave()
    onSend?.()
  }, [isContentReadOnly, state.isDirty, runSave, onSend])

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
    }
  }, [dispatch])

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
    // stays keyed on isContentReadOnly alone so the "keep mine" retry
    // (runSave({force:true}) from the toast action) still works.
    if (isContentReadOnly || conflictPending || !state.isDirty) return
    const timer = setTimeout(() => {
      void runSave()
    }, 3000)
    return () => clearTimeout(timer)
    // Intentionally depends on the whole `state` object (not just isDirty) so
    // every edit resets the debounce timer — a genuine debounce, not a
    // fire-once-then-never-again effect. isContentReadOnly already folds in
    // lockedByServer + notCurrentByServer (see their computation above), so a
    // server-discovered lock/supersede stops this effect from scheduling any
    // further save — no toast storm. conflictPending is in the dep array (not
    // just the guard body) so FLIPPING it re-runs this effect and its cleanup
    // cancels any already-scheduled timer — a guard-body-only check would
    // still let one more save fire from a timer scheduled just before the
    // conflict landed.
  }, [state, isContentReadOnly, conflictPending, runSave])

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
    // freshly loaded version recomputes `locked` from its own sent_at/
    // client_response/hasSignature, so stale-latch carryover would wrongly
    // lock a version that isn't actually locked. Same reasoning applies to
    // the conflict/not-current latches (Phase 165 Plan 02) — both are scoped
    // to a rejected save against the PREVIOUS version.
    setLockedByServer(false)
    setConflictPending(false)
    setNotCurrentByServer(false)
  }, [currentVersionId, dispatch])

  // Push version chrome up to the page header via context
  const { setSlot } = useEstimateVersionSlot()
  const handleVersionChangeRef = useRef(handleVersionChange)
  handleVersionChangeRef.current = handleVersionChange

  const slotSaveStatus = saveStatus === 'dirty' ? 'idle' : (saveStatus as 'idle' | 'saving' | 'saved' | 'error')

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
    })
    return () => setSlot(null)
  }, [currentVersionId, versions, state.version, state.isDirty, isContentReadOnly, setSlot, localProjectName, slotSaveStatus, viewMode, handleViewModeChange])

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-3">
      {/* Phase 164 Plan 02 (TRUST-02) — lock banner. Only when this IS the
          current version AND it is locked (older, non-current versions
          already render their own "Read-only | older version" badge in
          EstimateHeader — this is a distinct, delivered-and-locked state). */}
      {isCurrent && locked && (
        <Alert>
          <Lock />
          <AlertTitle>{t('This estimate is locked')}</AlertTitle>
          <AlertDescription>
            <p>
              {t(
                'This estimate was delivered to the client and is locked. Create a new version to make changes.'
              )}
            </p>
            <Button size="sm" className="mt-2" onClick={() => void handleCreateNewVersion()}>
              {t('Create new version')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Phase 165 Plan 02 (SAVE-05, audit B3/RPC P0003) — this tab's belief
          that it holds the current version was WRONG (another tab/session
          superseded it, e.g. via createBlankEstimate) — terminal, like a
          lock: no autosave loop, no further saves possible from this tab. */}
      {notCurrentByServer && (
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

      {/* Quick-260718-m2q — 'page' view centers the document at US-Letter
          width via PaginatedDocumentOverlay's own canvas wrapper; 'width'
          leaves the document filling the column as before. Quick-260718-w4k
          — zoom scales the whole page group so the full letter sheet fits
          the visible viewport (print-preview fit). Phase 185 Plan 03
          (185-UI-SPEC.md §2/§3) — this wrapper now contains ONLY the canvas;
          IssuedInvoicesPanel/GenerateInvoiceDialog render as SIBLINGS below,
          in BOTH view modes, so unrelated invoice surfaces never sit inside
          the paginated tray. */}
      {viewMode === 'page' && (
        <div className="fixed bottom-24 right-8 z-30 pointer-events-none">
          {/* PDF-viewer-style zoom pill (260728 rework) — fixed at the lower
              right, clear of the sticky project header, the "Edit with AI"
              button, and the centered floating action pill. */}
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-zinc-900/90 px-2 py-1 text-zinc-100 shadow-lg backdrop-blur border border-white/10">
            <button
              type="button"
              aria-label="Zoom out"
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40"
              disabled={effectiveZoom <= 0.5}
              onClick={() => zoomStep(-0.1)}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Fit width"
              title="Fit width"
              className="min-w-[3.25rem] rounded-full px-1 text-center text-xs tabular-nums hover:bg-white/10"
              onClick={() => setZoomOverride(null)}
            >
              {Math.round(effectiveZoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40"
              disabled={effectiveZoom >= 1.5}
              onClick={() => zoomStep(0.1)}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      <div
        ref={pageWrapRef}
        className={viewMode === 'page' ? 'w-full' : undefined}
        style={viewMode === 'page' && effectiveZoom !== 1 ? { zoom: effectiveZoom } : undefined}
      >
        {viewMode === 'page' ? (
          <PaginatedDocumentOverlay
            pages={paginatedPages}
            company={company}
            templateId={estimateTemplateId}
            language={(estimate.language ?? 'en') as EstimateLanguage}
            brandColor={companyBrandColor ?? undefined}
          >
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
              pageView
              preparedBy={preparedBy}
              companyTerms={{ enabled: company.estimate_terms_enabled ?? false, text: company.estimate_terms_text ?? null }}
            />
          </PaginatedDocumentOverlay>
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
            pageView={false}
            preparedBy={preparedBy}
            companyTerms={{ enabled: company.estimate_terms_enabled ?? false, text: company.estimate_terms_text ?? null }}
          />
        )}
      </div>

      {/* Phase 94 — issued-invoice display (D-19) + generate-invoice action (D-18).
          PAYGATE-02: IssuedInvoicesPanel is a historical RECORD (it returns null
          when there are no invoices), so it stays ungated — a never-connected
          company simply has none. Only the forward-looking Generate-invoice
          affordance below is gated on paymentsEnabled (no orphan when off). */}
      <IssuedInvoicesPanel invoices={issuedInvoices} />

      {isCurrent && paymentsEnabled && (
        <div className="flex justify-end">
          <GenerateInvoiceDialog
            estimateId={estimate.id}
            currencyCode={state.currency_code}
            estimateTotalCents={Math.round(state.total * 100)}
            onIssued={() => router.refresh()}
          />
        </div>
      )}

      <EstimateFloatingActions
        isCurrent={isCurrent}
        status={slotSaveStatus}
        onSend={handleSend}
        onOpenPhotos={onOpenPhotos}
        onOpenSettings={gearDisabled ? undefined : () => setSettingsOpen(true)}
        linkClientSlot={linkClientSlot}
        refineSlot={
          isContentReadOnly ? undefined : (
            <RefineEstimateDialog
              estimateId={state.id}
              version={state.version}
              isDirty={state.isDirty}
              // REFINE-01 (audit G1): the dialog flushes THIS before its POST
              // when the editor is dirty -- runSave's own boolean IS the
              // flush-succeeded signal (false on lock/conflict/error, in
              // which case the dialog aborts before ever reaching the route).
              onBeforeRefine={() => runSave()}
              // REFINE-02: the LIVE current content, read by the dialog via a
              // ref at compute time (not a dialog-open snapshot) -- reflects
              // the flush above + 165-02's id remap.
              currentContent={{
                sections: state.sections,
                summary: state.summary,
                notes: state.notes,
                timeline: state.timeline,
                payment_terms: state.payment_terms,
                warranty_terms: state.warranty_terms,
              }}
              currencyCode={state.currency_code}
              onApply={(refined) => dispatch({ type: 'APPLY_REFINEMENT', refined })}
            />
          )
        }
      />

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
        />
      )}
    </div>
  )
}
