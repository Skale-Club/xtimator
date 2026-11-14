'use client'

import { useEffect, useRef } from 'react'
import { Camera, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/use-translation'
import { prepareClientPhoto } from '@/lib/clients/prepare-photo'

interface ClientLogoUploaderProps {
  preview: string | null
  clientInitial: string
  onFileSelect: (file: File, preview: string) => void
  onRemove: () => void
}

export function ClientLogoUploader({ preview, clientInitial, onFileSelect, onRemove }: ClientLogoUploaderProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const ownedObjectUrlRef = useRef<string | null>(null)

  useEffect(() => () => {
    if (ownedObjectUrlRef.current) URL.revokeObjectURL(ownedObjectUrlRef.current)
  }, [])

  function handleClick() {
    inputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    if (!picked) return

    // Reset input so the same file can be re-selected.
    e.target.value = ''

    // Large phone photos are resized in the browser to fit the 2 MB limit.
    const prepared = await prepareClientPhoto(picked)
    if ('error' in prepared) {
      toast.error(t(prepared.error))
      return
    }

    if (ownedObjectUrlRef.current) URL.revokeObjectURL(ownedObjectUrlRef.current)
    const objectUrl = URL.createObjectURL(prepared.file)
    ownedObjectUrlRef.current = objectUrl
    onFileSelect(prepared.file, objectUrl)
  }

  function handleRemove() {
    if (ownedObjectUrlRef.current) {
      URL.revokeObjectURL(ownedObjectUrlRef.current)
      ownedObjectUrlRef.current = null
    }
    onRemove()
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-label={t(preview ? 'Change photo' : 'Add photo')}
        title={t(preview ? 'Change photo' : 'Add photo')}
        onClick={handleClick}
        className="group inline-flex h-11 shrink-0 cursor-pointer items-center gap-2.5 rounded-lg text-sm font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="relative shrink-0">
          <Avatar className="size-11 border border-border">
            {preview ? <AvatarImage src={preview} alt={t('Client logo preview')} /> : null}
            <AvatarFallback className="bg-muted text-base">
              {preview ? null : clientInitial ? clientInitial.toUpperCase() : (
                <Camera className="h-5 w-5 text-muted-foreground" />
              )}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground group-hover:text-primary">
            <Camera aria-hidden="true" className="size-3" />
          </span>
        </span>
        <span className="hidden sm:inline">{t(preview ? 'Change photo' : 'Add photo')}</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {preview ? (
        <button
          type="button"
          aria-label={t('Remove photo')}
          title={t('Remove photo')}
          onClick={handleRemove}
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
