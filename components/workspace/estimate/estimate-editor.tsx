'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Lock, CircleDot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  saveEstimate,
  getEstimateByIdAction,
  consolidateEstimate,
  createNewDraftVersion,
} from '@/lib/actions/estimate'
import type { EstimateWithSections, Estimate } from '@/lib/queries/estimate'
import type { Recording } from '@/lib/queries/recording'
import type { Photo } from '@/lib/queries/photo'
import { useEstimateReducer, type EstimateEditorState } from './use-estimate-reducer'
import { EstimateHeader } from './estimate-header'
import { SectionCard } from './section-card'
import { EstimateTotals } from './estimate-totals'
import { GenerationProgress } from './generation-progress'
import { RefineEstimateDialog } from './refine-estimate-dialog'
import { EstimateFloatingActions } from './estimate-floating-actions'
import {
  showClientSuggestionToast,
  type GenerateEstimateResponse,
} from './client-suggestion-toast'

// ---------------------------------------------------------------------------
// Sortable section wrapper
// ---------------------------------------------------------------------------

function SortableSectionCard({
  section,
  dispatch,
  isReadOnly,
}: {
  section: EstimateEditorState['sections'][number]
  dispatch: React.Dispatch<import('./use-estimate-reducer').EstimateAction>
  isReadOnly?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <SectionCard
        section={section}
        dispatch={dispatch}
        dragHandleProps={listeners}
        isReadOnly={isReadOnly}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// State to save payload converter
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
  recordings: Recording[]
  photos: Photo[]
}

export function EstimateEditor({
  estimate,
  versions,
  projectId,
  photos,
}: EstimateEditorProps) {
  const router = useRouter()
  const [state, dispatch] = useEstimateReducer(estimate)
  const stateRef = useRef(state)
  stateRef.current = state

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [regenStep, setRegenStep] = useState(0)
  const [currentVersionId, setCurrentVersionId] = useState(estimate.id)
  const [isNewVersionPending, setIsNewVersionPending] = useState(false)

  // SEED-028 Phase B: read-only is derived from state. Old versions and
  // consolidated versions cannot be edited.
  const isReadOnly = !state.is_current || state.workflow_status === 'consolidated'
  const isCurrent = state.is_current

  // Sensors for section-level drag
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  // -------------------------------------------------------------------------
  // Save handlers (SEED-028 Phase B: no autosave; explicit save only)
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
    setTimeout(() => {
      setSaveStatus((s) => (s === 'saved' ? 'idle' : s))
    }, 2500)
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
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Estimate consolidated')
    router.refresh()
  }, [runSave, router])

  const handleDiscard = useCallback(async () => {
    const result = await getEstimateByIdAction(stateRef.current.id)
    if (result.error || !result.data) {
      toast.error('Failed to reload estimate')
      return
    }
    dispatch({ type: 'INIT', estimate: result.data })
    setSaveStatus('idle')
    toast.success('Changes discarded')
  }, [dispatch])

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

  // cmd/ctrl + S triggers Save Draft
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isSave = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's'
      if (!isSave) return
      e.preventDefault()
      if (!isReadOnly && stateRef.current.isDirty) {
        void handleSaveDraft()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isReadOnly, handleSaveDraft])

  // beforeunload guard while there are unsaved changes
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
    if (result.error || !result.data) {
      toast.error('Failed to load version')
      return
    }

    dispatch({ type: 'INIT', estimate: result.data })
    setSaveStatus('idle')
  }, [currentVersionId, dispatch])

  // -------------------------------------------------------------------------
  // Regenerate
  // -------------------------------------------------------------------------

  const handleRegenerate = useCallback(async () => {
    setIsRegenerating(true)
    setRegenStep(0)

    try {
      // Step 0: Analyze photos
      if (photos.length > 0) {
        const photoRes = await fetch('/api/analyze-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        })
        if (!photoRes.ok) throw new Error('Photo analysis failed')
      }

      // Step 1: Generate estimate
      setRegenStep(1)
      const genRes = await fetch('/api/generate-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!genRes.ok) throw new Error('Estimate generation failed')
      const generated = (await genRes.json()) as GenerateEstimateResponse

      // Step 2: Saving
      setRegenStep(2)
      await new Promise((r) => setTimeout(r, 500))

      // Step 3: Done
      setRegenStep(3)
      await new Promise((r) => setTimeout(r, 1000))

      router.refresh()
      showClientSuggestionToast({
        projectId,
        router,
        suggestion: generated.clientSuggestion,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsRegenerating(false)
    }
  }, [photos.length, projectId, router])

  // -------------------------------------------------------------------------
  // Section drag end
  // -------------------------------------------------------------------------

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = state.sections.findIndex((s) => s.id === active.id)
    const newIndex = state.sections.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(
      state.sections.map((s) => s.id),
      oldIndex,
      newIndex
    )
    dispatch({ type: 'REORDER_SECTIONS', sectionIds: reordered })
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (isRegenerating) {
    return <GenerationProgress currentStep={regenStep} />
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Workflow status badge — replaces the old autosave status bar. */}
      <div className="flex items-center gap-2">
        {state.workflow_status === 'consolidated' ? (
          <Badge
            variant="outline"
            className="gap-1.5 border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
          >
            <Lock className="h-3 w-3" />
            Consolidated · v{state.version}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1.5 text-muted-foreground">
            <CircleDot className="h-3 w-3" />
            Draft · v{state.version}
          </Badge>
        )}
        {state.isDirty && !isReadOnly && (
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
        )}
        {!isReadOnly && (
          <div className="ml-auto">
            <RefineEstimateDialog
              estimateId={state.id}
              version={state.version}
              onApply={(refined) => dispatch({ type: 'APPLY_REFINEMENT', refined })}
            />
          </div>
        )}
      </div>

      {/* Header (summary, notes, version selector, etc.) */}
      <EstimateHeader
        state={state}
        dispatch={dispatch}
        versions={versions}
        onVersionChange={handleVersionChange}
        onRegenerate={handleRegenerate}
        isReadOnly={isReadOnly}
        isCurrent={isCurrent}
      />

      {/* Sections with drag-and-drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleSectionDragEnd}
      >
        <SortableContext
          items={state.sections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {state.sections.map((section) => (
              <SortableSectionCard
                key={section.id}
                section={section}
                dispatch={dispatch}
                isReadOnly={isReadOnly}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add section */}
      {!isReadOnly && (
        <Button
          variant="outline"
          onClick={() => dispatch({ type: 'ADD_SECTION' })}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Add Section
        </Button>
      )}

      {/* Totals */}
      <EstimateTotals state={state} dispatch={dispatch} isReadOnly={isReadOnly} />


      <EstimateFloatingActions
        workflowStatus={state.workflow_status}
        isCurrent={isCurrent}
        isDirty={state.isDirty}
        status={
          saveStatus === 'dirty' ? 'idle' : (saveStatus as 'idle' | 'saving' | 'saved' | 'error')
        }
        onSaveDraft={handleSaveDraft}
        onConsolidate={handleConsolidate}
        onDiscard={handleDiscard}
        onNewVersion={handleNewVersion}
        isNewVersionPending={isNewVersionPending}
      />
    </div>
  )
}
