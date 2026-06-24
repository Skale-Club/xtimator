'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { deleteEntry } from './actions'
import { useTranslation } from '@/lib/i18n/use-translation'

export function EntryActions({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { t } = useTranslation()

  function handleDelete() {
    if (!confirm(t('Delete this entry? This cannot be undone.'))) return
    startTransition(async () => {
      const result = await deleteEntry(id)
      if (result.ok) {
        toast.success(t('Entry deleted.'))
        router.refresh()
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="text-xs text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
      >
        {t('Delete')}
      </button>
    </div>
  )
}
