'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  saveEstimate,
  getEstimateByIdAction,
  consolidateEstimate,
  createNewDraftVersion,
} from '@/lib/actions/estimate'
import { renameProjectAction } from '@/lib/actions/project'
import type { EstimateWithSections, Estimate } from '@/lib/queries/estimate'
import type { Recording } from '@/lib/queries/recording'
import type { Photo } from '@/lib/queries/photo'
import { useEstimateReducer, type EstimateEditorState } from './use-estimate-reducer'
import { EstimateFloatingActions } from './estimate-floating-actions'
import {
  EstimateDocument,
  type EstimateDocumentData,
  type DocumentClient,
  type DocumentCompany,
} from './estimate-document'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { PriceBookItem } from '@/lib/queries/price-book'
import { useEstimateVersionSlot } from '@/components/workspace/estimate-version-context'

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
    estimate_date: state.estimate_date,
    estimate_number: state.estimate_number,
    currency_code: state.currency_code,
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
    summary: state.summary,
    notes: state.notes,
    timeline: state.timeline,
    payment_terms: state.payment_terms,
    warranty_terms: state.warranty_terms,
    discount_type: state.discount_type,
    discount_value: state.discount_value,
    tax_rate: state.tax_rate,
    estimate_date: state.estimate_date,
    estimate_number: state.estimate_number,
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
  projectId: string
  companyId: string
  companyBrandColor: string | null
  /** Quick-260526-jo4: full company header (logo + contact + address) rendered in the editor. */
  company: DocumentCompany
  recordings: Recording[]
  photos: Photo[]
  /** Project context for the document header */
  projectName: string
  projectType: string | null
  client: DocumentClient | null
  /** R6 — wired by parent surface (OverviewTab). */
  onRecord?: () => void
  linkClientSlot?: React.ReactNode
  /** Quick-260525-qbc: server-fetched price book for description autocomplete. */
  priceBookItems: PriceBookItem[]
}

export function EstimateEditor({
  estimate,
  versions,
  projectId,
  companyBrandColor,
  company,
  photos,
  projectName,
  projectType,
  client,
  onRecord,
  linkClientSlot,
  priceBookItems,
}: EstimateEditorProps) {
  const router = useRouter()
  const [state, dispatch] = useEstimateReducer(estimate)
  const stateRef = useRef(state)
  stateRef.current = state

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [currentVersionId, setCurrentVersionId] = useState(estimate.id)
  const [isNewVersionPending, setIsNewVersionPending] = useState(false)
  const [localProjectName, setLocalProjectName] = useState(projectName)

  const isReadOnly = !state.is_current || state.workflow_status === 'consolidated'
  const isCurrent = state.is_current

  // -------------------------------------------------------------------------
  // Save handlers
  // -------------------------------------------------------------------------

  const runSave = useCallback(async (): Promise<boolean> => {
    if (isReadOnly) return false
    setSaveStatus('saving')
    const result = await saveEstimate(stateToSavePayload(stateRef.current))
    if (result.error) {
      setSaveStatus('error')
      toast.error(result.error)
      return false
    }
    dispatch({ type: 'MARK_SAVED' })
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2500)
    return true
  }, [isReadOnly, dispatch])

  const handleSaveDraft = useCallback(async () => {
    const ok = await runSave()
    if (ok) toast.success('Draft saved')
  }, [runSave])

  const handleConsolidate = useCallback(async () => {
    const saveOk = await runSave()
    if (!saveOk) return
    const result = await consolidateEstimate(stateRef.current.id)
    if (result.error) { toast.error(result.error); return }
    const refreshed = await getEstimateByIdAction(stateRef.current.id)
    if (refreshed.data) dispatch({ type: 'INIT', estimate: refreshed.data })
    toast.success('Estimate consolidated')
    router.refresh()
  }, [runSave, router, dispatch])

  const handleDiscard = useCallback(async () => {
    const result = await getEstimateByIdAction(stateRef.current.id)
    if (result.error || !result.data) { toast.error('Failed to reload estimate'); return }
    dispatch({ type: 'INIT', estimate: result.data })
    setSaveStatus('idle')
    toast.success('Changes discarded')
  }, [dispatch])

  const handleRenameProject = useCallback(async (name: string) => {
    const result = await renameProjectAction(projectId, name)
    if (result.error) { toast.error(result.error); return }
    setLocalProjectName(name)
    router.refresh()
  }, [projectId, router])

  const handleNewVersion = useCallback(async () => {
    setIsNewVersionPending(true)
    try {
      const result = await createNewDraftVersion(stateRef.current.id)
      if (result.error || !result.data) {
        toast.error(result.error ?? 'Failed to create new version')
        return
      }
      toast.success(result.data.reused ? 'Opened existing draft' : 'New draft version created')
      router.refresh()
    } finally {
      setIsNewVersionPending(false)
    }
  }, [router])

  // cmd/ctrl + S
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isSave = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's'
      if (!isSave) return
      e.preventDefault()
      if (!isReadOnly && stateRef.current.isDirty) void handleSaveDraft()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isReadOnly, handleSaveDraft])

  // beforeunload guard
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!stateRef.current.isDirty || isReadOnly) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isReadOnly])

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
  }, [currentVersionId, dispatch])

  // Push version chrome up to the page header via context
  const { setSlot } = useEstimateVersionSlot()
  const handleVersionChangeRef = useRef(handleVersionChange)
  handleVersionChangeRef.current = handleVersionChange

  useEffect(() => {
    setSlot({
      currentVersionId,
      versions,
      workflowStatus: state.workflow_status,
      version: state.version,
      isDirty: state.isDirty,
      isReadOnly,
      onVersionChange: (id) => handleVersionChangeRef.current(id),
      projectName: localProjectName,
      onProjectRenamed: setLocalProjectName,
    })
    return () => setSlot(null)
  }, [currentVersionId, versions, state.workflow_status, state.version, state.isDirty, isReadOnly, setSlot, localProjectName])

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-3">
      {/* WYSIWYG document surface */}
      <EstimateDocument
        mode="edit"
        data={stateToDocumentData(state)}
        company={company}
        brandColor={companyBrandColor ?? undefined}
        client={client}
        projectName={localProjectName}
        projectType={projectType}
        language={(estimate.language ?? 'en') as EstimateLanguage}
        estimateVersion={state.version}
        estimateSeq={state.estimate_seq}
        estimateCreatedAt={estimate.created_at}
        dispatch={dispatch}
        isReadOnly={isReadOnly}
        projectId={projectId}
        onRenameProject={isReadOnly ? undefined : handleRenameProject}
        priceBookItems={priceBookItems}
      />

      <EstimateFloatingActions
        workflowStatus={state.workflow_status}
        isCurrent={isCurrent}
        isDirty={state.isDirty}
        status={saveStatus === 'dirty' ? 'idle' : (saveStatus as 'idle' | 'saving' | 'saved' | 'error')}
        onSaveDraft={handleSaveDraft}
        onConsolidate={handleConsolidate}
        onDiscard={handleDiscard}
        onNewVersion={handleNewVersion}
        isNewVersionPending={isNewVersionPending}
        onRecord={onRecord}
        linkClientSlot={linkClientSlot}
      />
    </div>
  )
}
