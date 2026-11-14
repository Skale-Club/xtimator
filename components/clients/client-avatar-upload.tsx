'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ImageUp, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { removeClientLogo, uploadClientLogoAction } from '@/lib/actions/client'
import { prepareClientPhoto } from '@/lib/clients/prepare-photo'
import { initialsOf } from '@/components/clients/client-list'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

interface ClientAvatarUploadProps {
  clientId: string
  clientName: string
  logoUrl: string | null
  className?: string
}

/**
 * The client page's avatar, which is also where its photo is set. Without a
 * photo, a tap opens the file picker (camera or gallery on a phone); with one,
 * a small menu offers Change photo / Remove photo. The upload starts at once,
 * shows the new photo immediately and refreshes the page when it is saved.
 */
export function ClientAvatarUpload({ clientId, clientName, logoUrl, className }: ClientAvatarUploadProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const shown = preview ?? logoUrl

  // A saved photo arrived from the server: drop the local preview.
  useEffect(() => {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
  }, [logoUrl])

  function pick() {
    inputRef.current?.click()
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    event.target.value = '' // the same file can be picked again
    if (!picked) return
    const prepared = await prepareClientPhoto(picked)
    if ('error' in prepared) {
      toast.error(t(prepared.error))
      return
    }
    const local = URL.createObjectURL(prepared.file)
    setPreview(local)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('file', prepared.file)
      const result = await uploadClientLogoAction(clientId, fd)
      if ('error' in result && result.error) {
        toast.error(t(result.error))
        setPreview(null)
        URL.revokeObjectURL(local)
        return
      }
      toast.success(t('Photo updated'))
      router.refresh()
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await removeClientLogo(clientId)
      if ('error' in result && result.error) {
        toast.error(t(result.error))
        return
      }
      toast.success(t('Photo removed'))
      router.refresh()
    })
  }

  const avatar = (
    <span className={cn('group/avatar relative inline-flex shrink-0 rounded-full', className)}>
      <Avatar className={cn('size-full', !shown && 'gradient-brand')}>
        {shown && <AvatarImage src={shown} alt="" className="object-cover" />}
        <AvatarFallback className="bg-transparent text-lg font-semibold text-white">{initialsOf(clientName)}</AvatarFallback>
      </Avatar>
      {/* Desktop: a hover veil says what a click does */}
      <span className="pointer-events-none absolute inset-0 hidden items-center justify-center rounded-full bg-black/55 text-[11px] font-medium leading-tight text-white opacity-0 transition-opacity group-hover/avatar:opacity-100 md:flex">
        {shown ? t('Change photo') : t('Add photo')}
      </span>
      {/* Camera badge (always visible on a phone, where there is no hover) */}
      <span className="absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground md:hidden">
        <Camera className="h-3 w-3" />
      </span>
      {isPending && (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55">
          <Loader2 className="h-5 w-5 animate-spin text-white" />
        </span>
      )}
    </span>
  )

  const triggerClass = 'shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait'

  return (
    <>
      {shown ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={triggerClass} disabled={isPending} aria-label={`${t('Photo')}: ${clientName}`}>
              {avatar}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={pick}>
              <ImageUp className="h-4 w-4" />
              {t('Change photo')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={remove}>
              <Trash2 className="h-4 w-4" />
              {t('Remove photo')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button type="button" className={triggerClass} onClick={pick} disabled={isPending} aria-label={`${t('Add photo')}: ${clientName}`}>
          {avatar}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onFile}
        data-testid="client-photo-input"
      />
    </>
  )
}
