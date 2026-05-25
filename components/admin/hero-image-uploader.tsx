'use client'

import { useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const RECOMMENDED_SIDE = 800

/**
 * Square (1:1) image uploader for the landing hero. Mirrors the OgImageUploader
 * pattern (lifted state → parent owns File and removal flag) but with a 1:1
 * preview surface that matches the rendered hero slot on the public page.
 */
interface HeroImageUploaderProps {
  currentUrl: string | null
  onFileSelect: (file: File, preview: string) => void
  onRemove: () => void
}

export function HeroImageUploader({
  currentUrl,
  onFileSelect,
  onRemove,
}: HeroImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null)

  const preview = localPreview ?? currentUrl

  function handleClick() {
    inputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Unsupported image format. Please upload PNG, JPG, or WebP.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Hero image must be under 4MB.')
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setLocalPreview(objectUrl)
    setDimensions(null)
    onFileSelect(file, objectUrl)
  }

  function handleRemove() {
    setLocalPreview(null)
    setDimensions(null)
    onRemove()
  }

  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    setDimensions({ w: img.naturalWidth, h: img.naturalHeight })
  }

  const tooSmall =
    dimensions != null &&
    (dimensions.w < RECOMMENDED_SIDE || dimensions.h < RECOMMENDED_SIDE)
  const offSquare =
    dimensions != null && Math.abs(dimensions.w - dimensions.h) / Math.max(dimensions.w, dimensions.h) > 0.05

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        aria-label="Upload hero image"
        onClick={handleClick}
        className="cursor-pointer rounded-xl border border-dashed border-border hover:border-muted-foreground transition-colors aspect-square w-full max-w-sm overflow-hidden bg-muted/30"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Hero image preview"
            onLoad={handleImgLoad}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImagePlus className="h-8 w-8" />
            <span className="text-sm">Upload hero image</span>
            <span className="text-xs opacity-70">800 x 800 recommended (1:1)</span>
          </div>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {dimensions && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {dimensions.w} x {dimensions.h}
          </span>
          {tooSmall && (
            <span className="text-xs text-destructive">
              Recommended at least {RECOMMENDED_SIDE} x {RECOMMENDED_SIDE}
            </span>
          )}
          {offSquare && !tooSmall && (
            <span className="text-xs text-amber-500">
              Image isn&apos;t square — it will be cropped to 1:1 on the page.
            </span>
          )}
        </div>
      )}

      <span className="text-xs text-muted-foreground">
        Ideal: square (1:1), PNG / JPG / WebP, under 4MB.
      </span>

      {preview ? (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClick}
            className="text-sm text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Change
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Remove
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove hero image?</AlertDialogTitle>
                <AlertDialogDescription>
                  The landing hero will collapse to a single column until you upload a new image.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRemove}>Remove</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
    </div>
  )
}
