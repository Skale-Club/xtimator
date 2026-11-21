'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ImageOff, Loader2, Upload, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import {
  listProjectCoverPhotos,
  removeProjectCover,
  resetProjectCover,
  setProjectCoverFromPhoto,
  uploadProjectCover,
} from '@/lib/actions/project-cover'
import { prepareCoverImage } from '@/lib/projects/prepare-cover'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
}

type CoverPhoto = { id: string; url: string }
type Mode = 'auto' | 'photo' | 'upload' | 'none'

/**
 * "Thumbnail" for one project: pick one of its photos, upload an image used
 * only as the thumbnail, go back to the first photo automatically, or remove
 * it. Bottom sheet on phones, centred card from sm up.
 */
export function ProjectCoverDialog({ open, onOpenChange, projectId, projectName }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<CoverPhoto[]>([])
  const [mode, setMode] = useState<Mode>('auto')
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    listProjectCoverPhotos(projectId)
      .then((result) => {
        if (cancelled) return
        if ('error' in result && result.error) {
          toast.error(t('Could not load the photos.'))
          return
        }
        if ('data' in result && result.data) {
          setPhotos(result.data.photos)
          setMode(result.data.mode)
          setCoverPhotoId(result.data.coverPhotoId)
        }
      })
      .catch(() => {
        if (!cancelled) toast.error(t('Could not load the photos.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // t changes identity with the language; the list only reloads when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId])

  async function run(action: () => Promise<{ error?: string } | { data?: unknown }>, successMessage: string) {
    if (busy) return
    setBusy(true)
    try {
      const result = await action()
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(successMessage)
      router.refresh()
      onOpenChange(false)
    } catch {
      toast.error(t('Could not update the thumbnail.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    const prepared = await prepareCoverImage(file)
    if ('error' in prepared) {
      toast.error(t(prepared.error))
      return
    }
    const formData = new FormData()
    formData.append('file', prepared.file)
    await run(() => uploadProjectCover(projectId, formData), t('Thumbnail updated'))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <BottomSheetContent desktopClassName="sm:max-w-md">
        <DialogHeader
          data-sheet-drag=""
          className="flex shrink-0 touch-none flex-row items-center justify-between gap-3 pl-5 pr-3 pt-1 pb-1 text-left sm:px-6 sm:pt-5"
        >
          <DialogTitle className="text-[19px] leading-tight font-semibold tracking-tight">{t('Thumbnail')}</DialogTitle>
          <BottomSheetCloseButton label={t('Close')} />
          <DialogDescription className="sr-only">
            {`${projectName}: ${t('Choose a photo from this project or upload an image.')}`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          <div>
            <p className="mb-2 text-sm font-medium">{t('Project photos')}</p>
            {loading ? (
              <div className="flex h-24 items-center justify-center text-muted-foreground" role="status">
                <Loader2 className="size-5 animate-spin" aria-hidden />
              </div>
            ) : photos.length === 0 ? (
              <p className="rounded-md bg-muted/50 px-3 py-4 text-sm text-muted-foreground" data-testid="cover-no-photos">
                {t('This project has no photos yet.')}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="cover-photo-grid">
                {photos.map((photo) => {
                  const current = mode === 'photo' && coverPhotoId === photo.id
                  return (
                    <button
                      key={photo.id}
                      type="button"
                      disabled={busy}
                      aria-pressed={current}
                      aria-label={current ? t('Current thumbnail') : t('Use this photo as thumbnail')}
                      onClick={() => run(() => setProjectCoverFromPhoto(projectId, photo.id), t('Thumbnail updated'))}
                      className={cn(
                        'relative aspect-square overflow-hidden rounded-md bg-muted outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                        current && 'ring-2 ring-primary',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- private photo through the proxy */}
                      <img src={photo.url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                      {current && (
                        <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3" aria-hidden />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              data-testid="cover-file-input"
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                void handleFile(file)
              }}
            />
            <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
              {t('Upload image')}
            </Button>
            <Button
              variant="outline"
              disabled={busy || mode === 'auto'}
              onClick={() => run(() => resetProjectCover(projectId), t('Thumbnail updated'))}
            >
              <Wand2 className="size-4" aria-hidden />
              {t('Use first photo automatically')}
            </Button>
            <Button
              variant="outline"
              disabled={busy || mode === 'none'}
              onClick={() => run(() => removeProjectCover(projectId), t('Thumbnail removed'))}
            >
              <ImageOff className="size-4" aria-hidden />
              {t('Remove thumbnail')}
            </Button>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-5 py-3 sm:px-6">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {t('Close')}
          </Button>
        </div>
      </BottomSheetContent>
    </Dialog>
  )
}
