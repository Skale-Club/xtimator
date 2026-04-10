'use client'

import { type Dispatch } from 'react'
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
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ItemRow } from './item-row'
import type { EditorSection, EstimateAction } from './use-estimate-reducer'

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// ---------------------------------------------------------------------------
// Sortable item wrapper
// ---------------------------------------------------------------------------

function SortableItemRow({
  item,
  sectionId,
  dispatch,
  isReadOnly,
}: {
  item: EditorSection['items'][number]
  sectionId: string
  dispatch: Dispatch<EstimateAction>
  isReadOnly?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <tbody ref={setNodeRef} style={style} {...attributes}>
      <ItemRow
        item={item}
        sectionId={sectionId}
        onUpdate={(field, value) =>
          dispatch({ type: 'UPDATE_ITEM', sectionId, itemId: item.id, field, value })
        }
        onRemove={() =>
          dispatch({ type: 'REMOVE_ITEM', sectionId, itemId: item.id })
        }
        dragHandleProps={listeners}
        isReadOnly={isReadOnly}
      />
    </tbody>
  )
}

// ---------------------------------------------------------------------------
// SectionCard
// ---------------------------------------------------------------------------

interface SectionCardProps {
  section: EditorSection
  dispatch: Dispatch<EstimateAction>
  dragHandleProps?: Record<string, unknown>
  isReadOnly?: boolean
}

export function SectionCard({ section, dispatch, dragHandleProps, isReadOnly }: SectionCardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = section.items.findIndex((i) => i.id === active.id)
    const newIndex = section.items.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(
      section.items.map((i) => i.id),
      oldIndex,
      newIndex
    )
    dispatch({ type: 'REORDER_ITEMS', sectionId: section.id, itemIds: reordered })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-3">
        {!isReadOnly && (
          <span
            className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground"
            {...dragHandleProps}
          >
            <GripVertical className="h-5 w-5" />
          </span>
        )}
        <Input
          value={section.title}
          onChange={(e) =>
            dispatch({ type: 'UPDATE_SECTION_TITLE', sectionId: section.id, title: e.target.value })
          }
          className="h-9 text-base font-semibold max-w-xs"
          disabled={isReadOnly}
        />
        <div className="flex-1" />
        {!isReadOnly && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => dispatch({ type: 'REMOVE_SECTION', sectionId: section.id })}
            className="h-9 w-9 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="py-2 px-1 w-8" />
                <th className="py-2 px-1 text-left font-medium">Description</th>
                <th className="py-2 px-1 w-20 text-right font-medium">Qty</th>
                <th className="py-2 px-1 w-20 text-left font-medium">Unit</th>
                <th className="py-2 px-1 w-28 text-right font-medium">Unit Price</th>
                <th className="py-2 px-1 w-28 text-right font-medium">Total</th>
                <th className="py-2 px-1 w-10" />
              </tr>
            </thead>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={section.items.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {section.items.map((item) => (
                  <SortableItemRow
                    key={item.id}
                    item={item}
                    sectionId={section.id}
                    dispatch={dispatch}
                    isReadOnly={isReadOnly}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3">
          {!isReadOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dispatch({ type: 'ADD_ITEM', sectionId: section.id })}
              className="gap-1 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Item
            </Button>
          )}
          <div className="ml-auto text-sm font-medium tabular-nums">
            Section Total: ${formatCurrency(section.subtotal)}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
