'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { EntryForm, type EntryFormInitial } from '../entry-form'
import { updateCompanyEntry } from '@/lib/actions/company-knowledge'
import type { CompanyKnowledgeEntryInput } from '@/lib/schemas/knowledge'
import { useTranslation } from '@/lib/i18n/use-translation'

type OverlayEntryRow = {
  id: string
  title: string
  body: string
  source: string | null
}

export function EditEntryWrapper({ entry }: { entry: OverlayEntryRow }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { t } = useTranslation()

  const initial: EntryFormInitial = {
    title: entry.title,
    body: entry.body,
    source: entry.source,
  }

  async function handleSave(data: CompanyKnowledgeEntryInput) {
    startTransition(async () => {
      const result = await updateCompanyEntry(entry.id, {
        ...data,
        source: data.source?.trim() || null,
      })
      if (result.ok) {
        toast.success(t('Entry updated.'))
        router.push('/settings/knowledge')
      } else {
        toast.error(result.message)
      }
    })
  }
  return <EntryForm initial={initial} onSave={handleSave} isPending={isPending} />
}
