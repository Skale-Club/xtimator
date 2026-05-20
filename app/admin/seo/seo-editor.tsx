'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { seoSchema, type SeoInput } from '@/lib/schemas/admin'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { OgImageUploader } from '@/components/admin/og-image-uploader'

import { saveSeo } from './actions'
import { useTranslation } from '@/lib/i18n/use-translation'

export type SeoInitial = {
  siteTitle: string
  metaDescription: string
  ogImageUrl: string
  canonicalBaseUrl: string
}

interface SeoEditorProps {
  initial: SeoInitial
}

export function SeoEditor({ initial }: SeoEditorProps) {
  const [isPending, startTransition] = useTransition()
  const { t } = useTranslation()

  // Lifted state for the OG image uploader. RHF still owns `ogImageUrl`
  // (source of truth for what gets persisted when no new file is selected);
  // these locals drive the preview and the upload payload that Plan 78-02
  // will consume on the server side.
  const [ogImagePreview, setOgImagePreview] = useState<string | null>(
    initial.ogImageUrl || null
  )
  const [ogImageFile, setOgImageFile] = useState<File | null>(null)
  const [ogImageRemoved, setOgImageRemoved] = useState(false)

  const form = useForm<SeoInput>({
    resolver: zodResolver(seoSchema) as never,
    defaultValues: {
      siteTitle: initial.siteTitle || null,
      metaDescription: initial.metaDescription || null,
      ogImageUrl: initial.ogImageUrl,
      canonicalBaseUrl: initial.canonicalBaseUrl,
    },
  })

  function handleOgImageSelect(file: File, preview: string) {
    setOgImageFile(file)
    setOgImagePreview(preview)
    setOgImageRemoved(false)
    // Mark form dirty; the actual URL is filled in by the server upload step
    // in Plan 78-02 (presence of `ogImageFile` in the FormData is the signal).
    form.setValue('ogImageUrl', '', { shouldDirty: true })
  }

  function handleOgImageRemove() {
    setOgImageFile(null)
    setOgImagePreview(null)
    setOgImageRemoved(true)
    form.setValue('ogImageUrl', '', { shouldDirty: true })
  }

  function onSubmit(values: SeoInput) {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('siteTitle', values.siteTitle ?? '')
      fd.set('metaDescription', values.metaDescription ?? '')
      fd.set('ogImageUrl', values.ogImageUrl ?? '')
      fd.set('canonicalBaseUrl', values.canonicalBaseUrl ?? '')
      // Wiring for Plan 78-02 — server currently ignores unknown FormData keys.
      if (ogImageFile) fd.set('ogImageFile', ogImageFile)
      fd.set('ogImageRemoved', String(ogImageRemoved))

      const result = await saveSeo(fd)
      if (result.ok) {
        toast.success(t('SEO settings saved.'))
      } else {
        toast.error(`${t("Couldn't save SEO settings.")} ${result.message}`)
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <FormField
          control={form.control}
          name="siteTitle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Site title')}</FormLabel>
              <FormControl>
                <Input
                  placeholder="Xtimator"
                  {...field}
                  value={field.value ?? ''}
                  onChange={e => field.onChange(e.target.value || null)}
                />
              </FormControl>
              <FormDescription>
                {t('Overrides app name in browser tabs and search results.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="metaDescription"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Meta description')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t('Professional AI-powered estimates for service businesses.')}
                  rows={3}
                  {...field}
                  value={field.value ?? ''}
                  onChange={e => field.onChange(e.target.value || null)}
                />
              </FormControl>
              <FormDescription>
                {t('Summary shown in search result snippets (max 300 chars).')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormItem>
          <FormLabel>{t('OG image')}</FormLabel>
          <FormControl>
            <OgImageUploader
              currentUrl={ogImagePreview}
              onFileSelect={handleOgImageSelect}
              onRemove={handleOgImageRemove}
            />
          </FormControl>
          <FormDescription>
            {t('Shown when sharing links on social media. Ideal: 1200 x 630 PNG or JPG, under 2MB.')}
          </FormDescription>
        </FormItem>

        <FormField
          control={form.control}
          name="canonicalBaseUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Canonical base URL')}</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://xtimator.com"
                  {...field}
                  value={field.value ?? ''}
                  onChange={e => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormDescription>
                {t('Your domain (e.g. https://xtimator.com) — required for correct OG image resolution.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('Save SEO settings')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
