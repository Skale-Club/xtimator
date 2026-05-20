'use client'

import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
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

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg']
const MIN_WIDTH = 600
const MIN_HEIGHT = 315

/**
 * Heuristic: a URL is "managed" (uploaded via this admin flow) when it points
 * at the platform-brand bucket's `og-images/` directory. We also accept the
 * legacy `branding-assets/og-images/` path so a future bucket rename or
 * historic upload doesn't accidentally trip the migration banner.
 */
function isManagedOgUrl(url: string): boolean {
  return url.includes('/platform-brand/og-images/') || url.includes('/branding-assets/og-images/')
}

interface OgImageUploaderProps {
  currentUrl: string | null
  onFileSelect: (file: File, preview: string) => void
  onRemove: () => void
}

export function OgImageUploader({
  currentUrl,
  onFileSelect,
  onRemove,
}: OgImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null)

  const preview = localPreview ?? currentUrl
  const showExternalHint =
    !localPreview && currentUrl != null && currentUrl !== '' && !isManagedOgUrl(currentUrl)

  function handleClick() {
    inputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input so the same file can be re-selected
    e.target.value = ''

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Unsupported image format. Please upload a PNG or JPG file.')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error('OG image must be under 2MB. Please choose a smaller file.')
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setLocalPreview(objectUrl)
    setDimensions(null) // reset so onLoad re-measures
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
    dimensions != null && (dimensions.w < MIN_WIDTH || dimensions.h < MIN_HEIGHT)

  return (
    <div className="flex flex-col items-start gap-2">
      {showExternalHint && (
        <p className="text-xs text-muted-foreground italic">
          Currently using external URL. Upload a managed image to better track usage.
        </p>
      )}

      <button
        type="button"
        aria-label="Upload OG image"
        onClick={handleClick}
        className="cursor-pointer rounded-lg border border-dashed border-border hover:border-muted-foreground transition-colors aspect-[1200/630] w-full max-w-md overflow-hidden bg-muted/30"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="OG image preview"
            onLoad={handleImgLoad}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera className="h-8 w-8" />
            <span className="text-sm">Upload OG image</span>
            <span className="text-xs opacity-70">1200 x 630 recommended</span>
          </div>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg"
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
              Recommended at least 600 x 315 (detected {dimensions.w} x {dimensions.h})
            </span>
          )}
        </div>
      )}

      <span className="text-xs text-muted-foreground">
        Ideal: 1200 x 630 (Facebook/Twitter card spec)
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
                <AlertDialogTitle>Remove OG image?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove the OG image from search and social previews. Continue?
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
