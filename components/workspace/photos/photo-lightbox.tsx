'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { Photo } from '@/lib/queries/photo'

interface PhotoLightboxProps {
  photos: Photo[]
  selectedIndex: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PhotoLightbox({
  photos,
  selectedIndex,
  open,
  onOpenChange,
}: PhotoLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(selectedIndex)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  // Sync currentIndex when selectedIndex or open changes
  useEffect(() => {
    if (open) {
      setCurrentIndex(selectedIndex)
    }
  }, [selectedIndex, open])

  // Fetch signed URL when index changes
  useEffect(() => {
    if (!open || photos.length === 0) return
    const photo = photos[currentIndex]
    if (!photo) return

    setImageUrl(null)
    const supabase = createClient()
    supabase.storage
      .from('photos')
      .createSignedUrl(photo.storage_path, 3600)
      .then(({ data }) => {
        if (data?.signedUrl) {
          setImageUrl(data.signedUrl)
        }
      })
  }, [currentIndex, open, photos])

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, photos.length - 1))
  }, [photos.length])

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0))
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    },
    [goNext, goPrev]
  )

  if (photos.length === 0) return null

  const currentPhoto = photos[currentIndex]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl p-0 gap-0"
        onKeyDown={handleKeyDown}
      >
        <div className="relative flex items-center justify-center bg-black min-h-[50vh]">
          {/* Image */}
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={currentPhoto?.caption ?? 'Photo'}
              className="object-contain max-h-[80vh] w-auto mx-auto"
            />
          ) : (
            <div className="h-[50vh] flex items-center justify-center">
              <div className="animate-pulse text-white/50">Loading...</div>
            </div>
          )}

          {/* Previous button */}
          {currentIndex > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-10 w-10"
              onClick={goPrev}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}

          {/* Next button */}
          {currentIndex < photos.length - 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-10 w-10"
              onClick={goNext}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          )}
        </div>

        {/* Caption and counter */}
        <div className="p-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {currentPhoto?.caption ?? ''}
          </p>
          <p className="text-sm text-muted-foreground">
            {currentIndex + 1} / {photos.length}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
