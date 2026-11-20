'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { PhotoDropZone } from './photo-drop-zone'
import { PhotoGrid } from './photo-grid'
import { PhotoLightbox } from './photo-lightbox'
import { reorderPhotos } from '@/lib/actions/photo'
import {
  addPhotoToEstimate,
  removePhotoFromEstimate,
  getAttachedPhotoIdsAction,
} from '@/lib/actions/estimate-photo'
import type { Photo } from '@/lib/queries/photo'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useEstimateVersionSlot } from '@/components/workspace/estimate-version-context'
import { PaywallReadOnlyNotice, usePaywallReadOnly } from '@/components/billing/paywall-read-only'

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
  const { t } = useTranslation()
  const { slot } = useEstimateVersionSlot()
  // Paywalled: the server refuses uploads, deletes, reordering and attaching,
  // so the photos are for viewing only (the lightbox still opens).
  const readOnly = usePaywallReadOnly()
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [attachedIds, setAttachedIds] = useState<Set<string>>(new Set())

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
        toast.error(t('Failed to save photo order'))
        setPhotos(previousPhotos)
      }
    },
    [photos]
  )

  const handlePhotoClick = useCallback((index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }, [])

  useEffect(() => {
    const estimateId = slot?.currentVersionId
    if (!estimateId) {
      setAttachedIds(new Set())
      return
    }
    let cancelled = false
    getAttachedPhotoIdsAction(estimateId).then((result) => {
      if (cancelled) return
      if ('data' in result) {
        setAttachedIds(new Set(result.data))
      }
    })
    return () => {
      cancelled = true
    }
  }, [slot?.currentVersionId])

  const handleToggleAttach = useCallback(
    async (photoId: string) => {
      const estimateId = slot?.currentVersionId
      if (!estimateId) return
      const wasAttached = attachedIds.has(photoId)
      // Optimistic update
      setAttachedIds((prev) => {
        const next = new Set(prev)
        wasAttached ? next.delete(photoId) : next.add(photoId)
        return next
      })
      const result = wasAttached
        ? await removePhotoFromEstimate(estimateId, photoId)
        : await addPhotoToEstimate(estimateId, photoId)
      if ('error' in result) {
        toast.error(
          t(wasAttached ? 'Failed to remove photo' : 'Failed to attach photo')
        )
        setAttachedIds((prev) => {
          const next = new Set(prev)
          wasAttached ? next.add(photoId) : next.delete(photoId)
          return next
        })
      }
    },
    [slot?.currentVersionId, attachedIds, t]
  )

  return (
    <div className="space-y-6 py-4">
      {readOnly ? (
        <PaywallReadOnlyNotice />
      ) : (
        <PhotoDropZone
          projectId={projectId}
          companyId={companyId}
          currentCount={photos.length}
          onPhotosUploaded={handlePhotosUploaded}
        />
      )}

      {photos.length > 0 && (
        <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
        <PhotoGrid
          photos={photos}
          onReorder={readOnly ? () => {} : handleReorder}
          onDelete={handleDelete}
          onPhotoClick={handlePhotoClick}
          isAttached={(id) => attachedIds.has(id)}
          onToggleAttach={handleToggleAttach}
        />
        </fieldset>
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
