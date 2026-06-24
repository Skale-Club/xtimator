'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { EntryForm } from './entry-form'
import { createEntry } from './actions'
import type { KnowledgeEntryInput } from '@/lib/schemas/knowledge'
import { useTranslation } from '@/lib/i18n/use-translation'

export function EntryFormWrapper() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { t } = useTranslation()
  async function handleSave(data: KnowledgeEntryInput) {
    startTransition(async () => {
      const result = await createEntry({ ...data, source: data.source?.trim() || null })
      if (result.ok) {
        toast.success(t('Entry created.'))
        router.push('/admin/knowledge')
      } else {
        toast.error(result.message)
      }
    })
  }
  return <EntryForm onSave={handleSave} isPending={isPending} />
}
