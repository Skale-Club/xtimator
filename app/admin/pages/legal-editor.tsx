'use client'

import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { legalPageSchema, type LegalPageInput } from '@/lib/schemas/admin'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SettingsSaveBar } from '@/components/settings/settings-ui'
import { saveLegalPage } from './actions'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { LegalPage } from '@/lib/queries/legal-pages'

interface LegalEditorProps {
  page: LegalPage
}

export function LegalEditor({ page }: LegalEditorProps) {
  const [isPending, startTransition] = useTransition()
  const { t } = useTranslation()

  const form = useForm<LegalPageInput>({
    resolver: zodResolver(legalPageSchema) as never,
    defaultValues: {
      title: page.title,
      content: page.content,
      effectiveDate: page.effective_date ?? '',
    },
  })

  function onSubmit(values: LegalPageInput) {
    startTransition(async () => {
      const result = await saveLegalPage(page.id, values)
      if (result.ok) {
        toast.success(t('Legal page saved.'))
        form.reset(values)
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Title')}</FormLabel>
              <FormControl>
                <Input placeholder={t('Page title')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="effectiveDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Effective date')}</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Content (Markdown)')}</FormLabel>
              <FormControl>
                <Textarea
                  rows={24}
                  placeholder={t('Write content in Markdown format...')}
                  className="font-mono text-sm"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <SettingsSaveBar
          dirty={form.formState.isDirty}
          pending={isPending}
          onDiscard={() => form.reset()}
          saveLabel={t('Save')}
        />
      </form>
    </Form>
  )
}
