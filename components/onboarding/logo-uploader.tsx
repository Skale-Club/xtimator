'use client'

import { useRef } from 'react'
import { Camera, CheckCircle2, Loader2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

const MAX_FILE_SIZE = 2 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg']
interface LogoUploaderProps {
  preview: string | null
  companyInitial?: string
  onFileSelect: (file: File, preview: string) => void
  onRemove: () => void
  presentation?: 'compact' | 'onboarding'
  status?: 'selected' | 'uploading' | 'saved' | 'error'
  onRetry?: () => void
}

export function LogoUploader({ preview, onFileSelect, onRemove, presentation = 'compact', status = 'selected', onRetry }: LogoUploaderProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const onboarding = presentation === 'onboarding'
  const chooseFile = () => inputRef.current?.click()
  function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    if (!ACCEPTED_TYPES.includes(file.type)) { toast.error(t('Unsupported image format. Please upload a PNG or JPG file.')); return }
    if (!file.size || file.size > MAX_FILE_SIZE) { toast.error(t('Logo must be under 2MB. Please choose a smaller file.')); return }
    onFileSelect(file, URL.createObjectURL(file))
  }

  return <div className={cn('flex flex-col', onboarding ? 'w-full items-center gap-3 py-2 text-center' : 'items-start gap-2')}>
    <button type="button" aria-label={t('Upload company logo')} onClick={chooseFile} aria-busy={status === 'uploading'}
      className={cn('flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border transition-colors hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        onboarding ? preview ? 'h-36 w-full max-w-[280px] bg-muted/30 p-4' : 'size-28 border-dashed bg-muted/50' : 'border-dashed')}>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={t('Logo preview')} className={onboarding ? 'max-h-full max-w-full object-contain' : 'h-20 w-auto max-w-[160px] rounded-lg object-contain p-2'} />
      ) : <span className={cn('flex items-center justify-center', onboarding ? 'size-28' : 'size-20 rounded-lg bg-muted')}><Camera aria-hidden className={cn('text-muted-foreground', onboarding ? 'size-7' : 'size-6')} /></span>}
    </button>
    <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={selectFile} />
    {preview ? <>
      {onboarding ? <div role="status" className="flex max-w-xs flex-col items-center gap-1.5 text-sm">
        <p className={cn('flex items-center justify-center gap-2 font-medium', status === 'error' ? 'text-destructive' : status === 'saved' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>
          {status === 'uploading' ? <Loader2 aria-hidden className="size-4 animate-spin" /> : status === 'error' ? <TriangleAlert aria-hidden className="size-4 shrink-0" /> : <CheckCircle2 aria-hidden className="size-4 shrink-0" />}
          {t(status === 'uploading' ? 'Uploading logo...' : status === 'saved' ? 'Logo uploaded' : status === 'error' ? 'Could not save your logo. Please try again.' : 'Logo selected')}
        </p>
        {status !== 'error' ? <p className="text-xs leading-relaxed text-muted-foreground">{t('Check your logo before continuing. You can change it below.')}</p> : onRetry ? <button type="button" onClick={onRetry} className="min-h-11 cursor-pointer text-primary underline">{t('Retry')}</button> : null}
      </div> : null}
      <div className="flex items-center justify-center gap-4">
        <button type="button" onClick={chooseFile} className={cn('cursor-pointer text-sm text-muted-foreground hover:text-foreground', onboarding && 'min-h-11 px-2')}>{t('Change')}</button>
        <button type="button" onClick={onRemove} className={cn('cursor-pointer text-sm text-muted-foreground hover:text-foreground', onboarding && 'min-h-11 px-2')}>{t('Remove')}</button>
      </div>
    </> : onboarding ? <button type="button" onClick={chooseFile} className="min-h-11 cursor-pointer text-sm text-muted-foreground hover:text-foreground">{t('Upload Logo')}</button> : <span className="text-sm text-muted-foreground">{t('Upload Logo')}</span>}
  </div>
}
