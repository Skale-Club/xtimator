'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { EntryForm } from './entry-form'
import { createCompanyEntry } from '@/lib/actions/company-knowledge'
import type { CompanyKnowledgeEntryInput } from '@/lib/schemas/knowledge'
import { useTranslation } from '@/lib/i18n/use-translation'

export function EntryFormWrapper() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { t } = useTranslation()

  async function handleSave(data: CompanyKnowledgeEntryInput) {
    startTransition(async () => {
      const result = await createCompanyEntry({ ...data, source: data.source?.trim() || null })
      if (result.ok) {
        toast.success(t('Entry created.'))
        router.push('/settings/knowledge')
      } else {
        toast.error(result.message)
      }
    })
  }

  return <EntryForm onSave={handleSave} isPending={isPending} />
}
