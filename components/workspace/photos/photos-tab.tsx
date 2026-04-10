'use client'

import { useState, useCallback } from 'react'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'
import { PhotoDropZone } from './photo-drop-zone'
import { PhotoGrid } from './photo-grid'
import { PhotoLightbox } from './photo-lightbox'
import { EmptyState } from '@/components/dashboard/empty-state'
import { reorderPhotos } from '@/lib/actions/photo'
import type { Photo } from '@/lib/queries/photo'

interface PhotosTabProps {
  projectId: string
  companyId: string
  initialPhotos: Photo[]
}

export function PhotosTab({
  projectId,
  companyId,
  initialPhotos,
}: PhotosTabProps) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const handlePhotosUploaded = useCallback((newPhotos: Photo[]) => {
    setPhotos((prev) => [...prev, ...newPhotos])
  }, [])

  const handleDelete = useCallback((id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const handleReorder = useCallback(
    async (reorderedPhotos: Photo[]) => {
      const previousPhotos = photos
      // Optimistic update
      setPhotos(reorderedPhotos)

      const result = await reorderPhotos(reorderedPhotos.map((p) => p.id))
      if ('error' in result) {
        toast.error('Failed to save photo order')
        setPhotos(previousPhotos)
      }
    },
    [photos]
  )

  const handlePhotoClick = useCallback((index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }, [])

  return (
    <div className="space-y-6 py-4">
      <PhotoDropZone
        projectId={projectId}
        companyId={companyId}
        currentCount={photos.length}
        onPhotosUploaded={handlePhotosUploaded}
      />

      {photos.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No photos yet"
          description="Upload photos of the job site to help generate an accurate estimate"
        />
      ) : (
        <PhotoGrid
          photos={photos}
          onReorder={handleReorder}
          onDelete={handleDelete}
          onPhotoClick={handlePhotoClick}
        />
      )}

      <PhotoLightbox
        photos={photos}
        selectedIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
      />
    </div>
  )
}
