'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
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
import { EstimateFloatingActions } from './estimate-floating-actions'
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

function stateToSavePayload(state: EstimateEditorState) {
  return {
    id: state.id,
    // Pre-launch audit fix (B7): optimistic-concurrency baseline — see
    // saveEstimate's expectedUpdatedAt doc in lib/actions/estimate.ts.
    expectedUpdatedAt: state.updated_at,
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
  const isContentReadOnly = !isCurrent || locked
  const gearDisabled = !isCurrent

  // -------------------------------------------------------------------------
  // Save handlers
  // -------------------------------------------------------------------------

  const handleDiscard = useCallback(async () => {
    const result = await getEstimateByIdAction(stateRef.current.id)
    if (result.error || !result.data) { toast.error('Failed to reload estimate'); return }
    dispatch({ type: 'INIT', estimate: result.data })
    setSaveStatus('idle')
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
    router.refresh()
  }, [projectId, dispatch, router])

  const runSave = useCallback(async (): Promise<boolean> => {
    if (isContentReadOnly) return false
    setSaveStatus('saving')
    const result = await saveEstimate(stateToSavePayload(stateRef.current))
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
      // Pre-launch audit fix (B7): a conflict means the save was REJECTED
      // server-side (another tab/session saved first) — local edits are still
      // sitting unsaved in the editor, not lost, but must not be silently
      // retried as-is (that would just fail again). Give the user a longer,
      // explicit toast with a one-click path to load the latest version —
      // reusing the existing Discard reload plumbing via handleDiscard.
      if ('conflict' in result && result.conflict) {
        toast.error(result.error, {
          duration: 15000,
          action: {
            label: 'Load latest version',
            onClick: () => void handleDiscard(),
          },
        })
      } else {
        toast.error(result.error)
      }
      return false
    }
    if (!result.data) return false
    dispatch({ type: 'MARK_SAVED', updated_at: result.data.updated_at })
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2500)
    return true
  }, [isContentReadOnly, dispatch, handleDiscard, t])

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
    if (isContentReadOnly || !state.isDirty) return
    const timer = setTimeout(() => {
      void runSave()
    }, 3000)
    return () => clearTimeout(timer)
    // Intentionally depends on the whole `state` object (not just isDirty) so
    // every edit resets the debounce timer — a genuine debounce, not a
    // fire-once-then-never-again effect. isContentReadOnly already folds in
    // lockedByServer (see its computation above), so a server-discovered lock
    // stops this effect from scheduling any further save — no toast storm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isContentReadOnly, runSave])

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
    // lock a version that isn't actually locked.
    setLockedByServer(false)
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
    })
    return () => setSlot(null)
  }, [currentVersionId, versions, state.version, state.isDirty, isContentReadOnly, setSlot, localProjectName, slotSaveStatus])

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

      {/* WYSIWYG document surface */}
      <EstimateDocument
        mode="edit"
        data={stateToDocumentData(state)}
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
      />

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
