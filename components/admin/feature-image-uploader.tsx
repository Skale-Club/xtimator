'use client'

import { useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'

const MAX_FILE_SIZE = 4 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

interface FeatureImageUploaderProps {
  currentUrl: string | null
  featureIndex: number
  onFileSelect: (file: File) => void
  onRemove: () => void
}

export function FeatureImageUploader({
  currentUrl,
  featureIndex,
  onFileSelect,
  onRemove,
}: FeatureImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)

  const preview = localPreview ?? currentUrl

  function handleClick() {
    inputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Unsupported format. Please upload PNG, JPG, or WebP.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Feature image must be under 4MB.')
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setLocalPreview(objectUrl)
    onFileSelect(file)
  }

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation()
    setLocalPreview(null)
    onRemove()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <button
          type="button"
          aria-label={`Upload image for feature ${featureIndex + 1}`}
          onClick={handleClick}
          className="relative w-full cursor-pointer overflow-hidden rounded-xl border border-dashed border-border bg-muted/30 transition-colors hover:border-muted-foreground"
          style={{ aspectRatio: '3/1' }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={`Feature ${featureIndex + 1} image preview`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
              <ImagePlus className="h-5 w-5" />
              <span className="text-sm">Upload feature image</span>
              <span className="text-xs opacity-70">Wide landscape (6:2). PNG, JPG, or WebP. Converted to WebP on save.</span>
            </div>
          )}
        </button>

        {preview && (
          <button
            type="button"
            aria-label="Remove feature image"
            onClick={handleRemove}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {preview && (
        <button
          type="button"
          onClick={handleClick}
          className="self-start text-xs text-muted-foreground hover:text-foreground"
        >
          Change image
        </button>
      )}

      <p className="text-xs text-muted-foreground">
        Optional. Wide landscape (3:1 ratio). Automatically converted to WebP on save.
      </p>
    </div>
  )
}
