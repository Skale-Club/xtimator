'use client'

import { useRef } from 'react'
import { Camera } from 'lucide-react'
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

export function ClientLogoUploader({
  preview,
  clientInitial,
  onFileSelect,
  onRemove,
}: ClientLogoUploaderProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleClick() {
    inputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    if (!picked) return

    // Reset input so the same file can be re-selected
    e.target.value = ''

    // Large phone photos are resized in the browser to fit the 2 MB limit.
    const prepared = await prepareClientPhoto(picked)
    if ('error' in prepared) {
      toast.error(t(prepared.error))
      return
    }

    const objectUrl = URL.createObjectURL(prepared.file)
    onFileSelect(prepared.file, objectUrl)
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-label={t('Upload client photo or logo')}
        onClick={handleClick}
        className="cursor-pointer"
      >
        <Avatar className="h-16 w-16">
          {preview ? (
            <AvatarImage src={preview} alt={t('Client logo preview')} />
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
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {preview ? (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleClick}
            className="px-2 py-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {t('Change')}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="px-2 py-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {t('Remove')}
          </button>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">{t('Photo or logo')}</span>
      )}
    </div>
  )
}
