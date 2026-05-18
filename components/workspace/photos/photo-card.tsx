'use client'

import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'
import { updatePhotoCaption, deletePhoto } from '@/lib/actions/photo'
import type { Photo } from '@/lib/queries/photo'
import { useTranslation } from '@/lib/i18n/use-translation'

interface PhotoCardProps {
  photo: Photo
  onClick: () => void
  onDelete: (id: string) => void
}

export function PhotoCard({ photo, onClick, onDelete }: PhotoCardProps) {
  const { t } = useTranslation()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isEditingCaption, setIsEditingCaption] = useState(false)
  const [caption, setCaption] = useState(photo.caption ?? '')
  const [isDeleting, setIsDeleting] = useState(false)
  const captionInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()
    createStorage(supabase)
      .getSignedUrl('photos', photo.storage_path, 3600)
      .then((signedUrl) => {
        setImageUrl(signedUrl)
      })
      .catch(() => {
        // signed URL failed — leave skeleton in place
      })
  }, [photo.storage_path])

  useEffect(() => {
    if (isEditingCaption && captionInputRef.current) {
      captionInputRef.current.focus()
    }
  }, [isEditingCaption])

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsDeleting(true)
    const result = await deletePhoto(photo.id)
    if ('error' in result) {
      setIsDeleting(false)
      return
    }
    onDelete(photo.id)
  }

  const handleCaptionSave = async () => {
    setIsEditingCaption(false)
    const trimmed = caption.trim()
    if (trimmed !== (photo.caption ?? '')) {
      await updatePhotoCaption(photo.id, trimmed)
    }
  }

  const handleCaptionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCaptionSave()
    }
    if (e.key === 'Escape') {
      setCaption(photo.caption ?? '')
      setIsEditingCaption(false)
    }
  }

  return (
    <div className="aspect-square overflow-hidden rounded-lg relative group">
      {/* Image */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={photo.caption ?? t('Photo')}
          className="object-cover w-full h-full cursor-pointer"
          onClick={onClick}
        />
      ) : (
        <Skeleton className="w-full h-full" />
      )}

      {/* Delete button */}
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
        aria-label={t('Delete photo')}
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Caption overlay */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6"
        onClick={(e) => {
          e.stopPropagation()
          if (!isEditingCaption) {
            setIsEditingCaption(true)
          }
        }}
      >
        {isEditingCaption ? (
          <input
            ref={captionInputRef}
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={handleCaptionSave}
            onKeyDown={handleCaptionKeyDown}
            className="w-full bg-transparent text-white text-xs border-b border-white/50 outline-none placeholder:text-white/50"
            placeholder={t('Add caption...')}
            maxLength={200}
          />
        ) : (
          <p className="text-white text-xs truncate cursor-text">
            {caption || (
              <span className="text-white/50">{t('Add caption...')}</span>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
