'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  companyKnowledgeEntrySchema,
  type CompanyKnowledgeEntryInput,
} from '@/lib/schemas/knowledge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/lib/i18n/use-translation'

export type EntryFormInitial = {
  title: string
  body: string
  source: string | null
}

type EntryFormProps = {
  initial?: EntryFormInitial
  onSave: (data: CompanyKnowledgeEntryInput) => Promise<void>
  isPending: boolean
}

export function EntryForm({ initial, onSave, isPending }: EntryFormProps) {
  const { t } = useTranslation()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CompanyKnowledgeEntryInput>({
    resolver: zodResolver(companyKnowledgeEntrySchema) as never,
    defaultValues: {
      title: initial?.title ?? '',
      body: initial?.body ?? '',
      source: initial?.source ?? '',
    },
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">{t('Title')}</Label>
        <Input id="title" {...register('title')} placeholder={t('Entry title')} />
        {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="body">{t('Body')}</Label>
        <Textarea
          id="body"
          {...register('body')}
          className="min-h-[300px]"
          placeholder={t('The knowledge content (how-to, guidance, facts)…')}
        />
        {errors.body && <p className="text-sm text-destructive">{errors.body.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="source">{t('Source (optional)')}</Label>
        <Input
          id="source"
          {...register('source')}
          placeholder={t('Where this came from (URL, reference)')}
        />
        {errors.source && <p className="text-sm text-destructive">{errors.source.message}</p>}
      </div>

      <Button type="submit" disabled={isPending} className="self-start">
        {t('Save entry')}
      </Button>
    </form>
  )
}
