'use client'

import { useRef } from 'react'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg']

interface LogoUploaderProps {
  preview: string | null
  companyInitial: string
  onFileSelect: (file: File, preview: string) => void
  onRemove: () => void
}

export function LogoUploader({
  preview,
  companyInitial,
  onFileSelect,
  onRemove,
}: LogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)

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
      toast.error('Logo must be under 2MB. Please choose a smaller file.')
      return
    }

    const objectUrl = URL.createObjectURL(file)
    onFileSelect(file, objectUrl)
  }

  function handleRemove() {
    onRemove()
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        role="button"
        aria-label="Upload company logo"
        onClick={handleClick}
        className="cursor-pointer rounded-lg border border-dashed border-border hover:border-muted-foreground transition-colors"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Logo preview"
            className="h-20 w-auto max-w-[160px] object-contain rounded-lg p-2"
          />
        ) : (
          <div className="h-20 w-20 flex items-center justify-center bg-muted rounded-lg">
            <Camera className="h-6 w-6 text-muted-foreground" />
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

      {preview ? (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClick}
            className="text-sm text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Change
          </button>
          <button
            type="button"
            onClick={handleRemove}
            className="text-sm text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Remove
          </button>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">Upload Logo</span>
      )}
    </div>
  )
}
