'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { EntryForm, type EntryFormInitial } from '../entry-form'
import { updateEntry } from '../actions'
import type { KnowledgeEntryInput } from '@/lib/schemas/knowledge'
import { useTranslation } from '@/lib/i18n/use-translation'

type KnowledgeEntryRow = {
  id: string
  industry_id: string
  title: string
  body: string
  source: string | null
}

export function EditEntryWrapper({ entry }: { entry: KnowledgeEntryRow }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { t } = useTranslation()

  const initial: EntryFormInitial = {
    industry_id: entry.industry_id,
    title: entry.title,
    body: entry.body,
    source: entry.source,
  }

  async function handleSave(data: KnowledgeEntryInput) {
    startTransition(async () => {
      const result = await updateEntry(entry.id, {
        ...data,
        source: data.source?.trim() || null,
      })
      if (result.ok) {
        toast.success(t('Entry updated.'))
        router.push('/admin/knowledge')
      } else {
        toast.error(result.message)
      }
    })
  }
  return <EntryForm initial={initial} onSave={handleSave} isPending={isPending} />
}
