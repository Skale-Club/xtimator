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
import { Plus, Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { saveEstimate } from '@/lib/actions/estimate'
import { getEstimateByIdAction } from '@/lib/actions/estimate'
import type { EstimateWithSections, Estimate } from '@/lib/queries/estimate'
import type { Recording } from '@/lib/queries/recording'
import type { Photo } from '@/lib/queries/photo'
import { useEstimateReducer, type EstimateEditorState } from './use-estimate-reducer'
import { EstimateHeader } from './estimate-header'
import { SectionCard } from './section-card'
import { EstimateTotals } from './estimate-totals'
import { GenerationProgress } from './generation-progress'
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
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [isCurrent, setIsCurrent] = useState(true)

  // Sensors for section-level drag
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  // -------------------------------------------------------------------------
  // Auto-save (2000ms debounce)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!state.isDirty || isReadOnly) return

    setSaveStatus('dirty')
    const timeout = setTimeout(async () => {
      setSaveStatus('saving')
      const result = await saveEstimate(stateToSavePayload(stateRef.current))
      if (result.error) {
        setSaveStatus('error')
        toast.error('Failed to save estimate')
      } else {
        dispatch({ type: 'MARK_SAVED' })
        setSaveStatus('saved')
        // Reset status after 3s
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    }, 2000)

    return () => clearTimeout(timeout)
  }, [state.isDirty, state.sections, state.summary, state.notes, state.timeline, state.payment_terms, state.warranty_terms, state.discount_type, state.discount_value, state.tax_rate, isReadOnly, dispatch])

  // -------------------------------------------------------------------------
  // Manual save
  // -------------------------------------------------------------------------

  const handleManualSave = useCallback(async () => {
    if (isReadOnly) return
    setSaveStatus('saving')
    const result = await saveEstimate(stateToSavePayload(stateRef.current))
    if (result.error) {
      setSaveStatus('error')
      toast.error('Failed to save estimate')
    } else {
      dispatch({ type: 'MARK_SAVED' })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
      toast.success('Estimate saved')
    }
  }, [isReadOnly, dispatch])

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
    const version = versions.find((v) => v.id === estimateId)
    setIsReadOnly(!version?.is_current)
    setIsCurrent(version?.is_current ?? false)
  }, [currentVersionId, versions, dispatch])

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
    <div className="space-y-6">
      {/* Save status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {saveStatus === 'saving' && (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Saving...</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              <span>Saved</span>
            </>
          )}
          {saveStatus === 'dirty' && (
            <>
              <AlertCircle className="h-4 w-4 text-[hsl(var(--warning))]" />
              <span>Unsaved changes</span>
            </>
          )}
          {saveStatus === 'error' && (
            <>
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span>Save failed</span>
            </>
          )}
        </div>
        {!isReadOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSave}
            disabled={saveStatus === 'saving'}
            className="gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
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
    </div>
  )
}
