'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { knowledgeEntrySchema, type KnowledgeEntryInput } from '@/lib/schemas/knowledge'
import { INDUSTRIES } from '@/lib/industries'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslation } from '@/lib/i18n/use-translation'

export type EntryFormInitial = {
  industry_id: string
  title: string
  body: string
  source: string | null
}

type EntryFormProps = {
  initial?: EntryFormInitial
  onSave: (data: KnowledgeEntryInput) => Promise<void>
  isPending: boolean
}

export function EntryForm({ initial, onSave, isPending }: EntryFormProps) {
  const { t } = useTranslation()
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<KnowledgeEntryInput>({
    resolver: zodResolver(knowledgeEntrySchema) as never,
    defaultValues: {
      industry_id: initial?.industry_id ?? '',
      title: initial?.title ?? '',
      body: initial?.body ?? '',
      source: initial?.source ?? '',
    },
  })

  const industryId = watch('industry_id')

  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="industry_id">{t('Industry')}</Label>
        <Select
          value={industryId}
          onValueChange={(val) => setValue('industry_id', val, { shouldValidate: true })}
        >
          <SelectTrigger id="industry_id">
            <SelectValue placeholder={t('Select industry')} />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRIES.map((ind) => (
              <SelectItem key={ind.id} value={ind.id}>
                {ind.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.industry_id && (
          <p className="text-sm text-destructive">{errors.industry_id.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">{t('Title')}</Label>
        <Input
          id="title"
          {...register('title')}
          placeholder={t('Entry title')}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="body">{t('Body')}</Label>
        <Textarea
          id="body"
          {...register('body')}
          className="min-h-[300px]"
          placeholder={t('The knowledge content (how-to, guidance, facts)…')}
        />
        {errors.body && (
          <p className="text-sm text-destructive">{errors.body.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="source">{t('Source (optional)')}</Label>
        <Input
          id="source"
          {...register('source')}
          placeholder={t('Where this came from (URL, reference)')}
        />
        {errors.source && (
          <p className="text-sm text-destructive">{errors.source.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isPending} className="self-start">
        {t('Save entry')}
      </Button>
    </form>
  )
}
