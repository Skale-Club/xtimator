'use client'

import { useRef } from 'react'
import { Camera } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg']

interface ClientLogoUploaderProps {
  preview: string | null
  clientInitial: string
  onFileSelect: (file: File, preview: string) => void
  onRemove: () => void
}

export function ClientLogoUploader({
  preview,
  clientInitial,
  onFileSelect,
  onRemove,
}: ClientLogoUploaderProps) {
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

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-label="Upload client logo"
        onClick={handleClick}
        className="cursor-pointer"
      >
        <Avatar className="h-16 w-16">
          {preview ? (
            <AvatarImage src={preview} alt="Client logo preview" />
          ) : null}
          <AvatarFallback className="bg-muted text-lg">
            {preview ? null : clientInitial ? clientInitial.toUpperCase() : (
              <Camera className="h-5 w-5 text-muted-foreground" />
            )}
          </AvatarFallback>
        </Avatar>
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
            onClick={onRemove}
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
