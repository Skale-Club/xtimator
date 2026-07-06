'use client'

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
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PhotoCard } from './photo-card'
import type { Photo } from '@/lib/queries/photo'

interface PhotoGridProps {
  photos: Photo[]
  onReorder: (reorderedPhotos: Photo[]) => void
  onDelete: (id: string) => void
  onPhotoClick: (index: number) => void
  isAttached: (id: string) => boolean
  onToggleAttach: (id: string) => void
}

function SortablePhoto({
  photo,
  index,
  onDelete,
  onPhotoClick,
  isAttached,
  onToggleAttach,
}: {
  photo: Photo
  index: number
  onDelete: (id: string) => void
  onPhotoClick: (index: number) => void
  isAttached: (id: string) => boolean
  onToggleAttach: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <PhotoCard
        photo={photo}
        onClick={() => onPhotoClick(index)}
        onDelete={onDelete}
        isAttached={isAttached(photo.id)}
        onToggleAttach={onToggleAttach}
      />
    </div>
  )
}

export function PhotoGrid({
  photos,
  onReorder,
  onDelete,
  onPhotoClick,
  isAttached,
  onToggleAttach,
}: PhotoGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  )

  if (photos.length === 0) return null

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = photos.findIndex((p) => p.id === active.id)
    const newIndex = photos.findIndex((p) => p.id === over.id)

    if (oldIndex !== -1 && newIndex !== -1) {
      const reordered = arrayMove(photos, oldIndex, newIndex)
      onReorder(reordered)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={photos.map((p) => p.id)}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((photo, index) => (
            <SortablePhoto
              key={photo.id}
              photo={photo}
              index={index}
              onDelete={onDelete}
              onPhotoClick={onPhotoClick}
              isAttached={isAttached}
              onToggleAttach={onToggleAttach}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
