'use client'

import { useTransition } from 'react'
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

import { saveSeo } from './actions'

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

  const form = useForm<SeoInput>({
    resolver: zodResolver(seoSchema) as never,
    defaultValues: {
      siteTitle: initial.siteTitle || null,
      metaDescription: initial.metaDescription || null,
      ogImageUrl: initial.ogImageUrl,
      canonicalBaseUrl: initial.canonicalBaseUrl,
    },
  })

  function onSubmit(values: SeoInput) {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('siteTitle', values.siteTitle ?? '')
      fd.set('metaDescription', values.metaDescription ?? '')
      fd.set('ogImageUrl', values.ogImageUrl ?? '')
      fd.set('canonicalBaseUrl', values.canonicalBaseUrl ?? '')

      const result = await saveSeo(fd)
      if (result.ok) {
        toast.success('SEO settings saved.')
      } else {
        toast.error(`Couldn't save SEO settings. ${result.message}`)
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6 max-w-2xl">
        <FormField
          control={form.control}
          name="siteTitle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Site title</FormLabel>
              <FormControl>
                <Input
                  placeholder="Xtimator"
                  {...field}
                  value={field.value ?? ''}
                  onChange={e => field.onChange(e.target.value || null)}
                />
              </FormControl>
              <FormDescription>
                Overrides app name in browser tabs and search results.
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
              <FormLabel>Meta description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Professional AI-powered estimates for service businesses."
                  rows={3}
                  {...field}
                  value={field.value ?? ''}
                  onChange={e => field.onChange(e.target.value || null)}
                />
              </FormControl>
              <FormDescription>
                Summary shown in search result snippets (max 300 chars).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="ogImageUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>OG image URL</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://xtimator.com/og-image.png"
                  {...field}
                  value={field.value ?? ''}
                  onChange={e => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormDescription>
                Full URL to image shown when sharing links on social media.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="canonicalBaseUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Canonical base URL</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://xtimator.com"
                  {...field}
                  value={field.value ?? ''}
                  onChange={e => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormDescription>
                Your domain (e.g. https://xtimator.com) — required for correct OG image
                resolution.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save SEO settings
          </Button>
        </div>
      </form>
    </Form>
  )
}
