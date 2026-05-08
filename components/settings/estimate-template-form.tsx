'use client'

import { useTransition } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { CompanySettings } from '@/lib/queries/company'
import { estimateTemplateSchema, type EstimateTemplateFormValues } from '@/lib/schemas/estimate-template'
import { saveEstimateTemplate } from '@/lib/actions/estimate-template'
import { TEMPLATE_DEFAULTS } from '@/lib/utils/estimate-template'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

interface EstimateTemplateFormProps {
  company: CompanySettings
}

export function EstimateTemplateForm({ company }: EstimateTemplateFormProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const form = useForm<EstimateTemplateFormValues>({
    resolver: zodResolver(estimateTemplateSchema) as Resolver<EstimateTemplateFormValues>,
    defaultValues: {
      greeting:  company.estimate_template_greeting  ?? '',
      opener:    company.estimate_template_opener    ?? '',
      closer:    company.estimate_template_closer    ?? '',
      signature: company.estimate_template_signature ?? '',
    },
  })

  function onSubmit(values: EstimateTemplateFormValues) {
    startTransition(async () => {
      const result = await saveEstimateTemplate({
        greeting:  values.greeting  || null,
        opener:    values.opener    || null,
        closer:    values.closer    || null,
        signature: values.signature || null,
      })
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Template saved.')
        router.refresh()
      }
    })
  }

  // Lightweight read-only preview (Claude's discretion — CONTEXT.md).
  // Uses form.watch so the preview updates as the user types.
  const previewLines = [
    form.watch('greeting')  || TEMPLATE_DEFAULTS.greeting,
    '',
    form.watch('opener')    || TEMPLATE_DEFAULTS.opener,
    '',
    '[ Items and totals will appear here ]',
    '',
    form.watch('closer')    || TEMPLATE_DEFAULTS.closer,
    '',
    form.watch('signature') || TEMPLATE_DEFAULTS.signature,
  ].join('\n')

  return (
    <div className="space-y-6">
      <Card className="w-full rounded-[var(--radius-md)]">
        <CardHeader className="border-b border-border">
          <CardTitle>Template Fields</CardTitle>
          <CardDescription>
            Leave a field empty to use the default. Changes apply to all future plain-text estimates.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              <FormField
                control={form.control}
                name="greeting"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Greeting</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder={TEMPLATE_DEFAULTS.greeting}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Variables: <code className="text-xs">{'{client_name}'}</code>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="opener"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Opening</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder={TEMPLATE_DEFAULTS.opener}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Variables:{' '}
                      <code className="text-xs">{'{company_name}'}</code>,{' '}
                      <code className="text-xs">{'{total}'}</code>,{' '}
                      <code className="text-xs">{'{items_breakdown}'}</code>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="closer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Closing</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={4}
                        placeholder={TEMPLATE_DEFAULTS.closer}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Variables:{' '}
                      <code className="text-xs">{'{company_name}'}</code>,{' '}
                      <code className="text-xs">{'{owner_name}'}</code>,{' '}
                      <code className="text-xs">{'{total}'}</code>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="signature"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Signature</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={4}
                        placeholder={TEMPLATE_DEFAULTS.signature}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Variables:{' '}
                      <code className="text-xs">{'{owner_name}'}</code>,{' '}
                      <code className="text-xs">{'{company_name}'}</code>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={isPending} className="min-w-40">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Template
              </Button>

            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Lightweight read-only preview — helps owners verify template without leaving the page */}
      <Card className="w-full rounded-[var(--radius-md)]">
        <CardHeader className="border-b border-border">
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            How your template looks (variables shown as-is; items and totals are placeholders).
          </CardDescription>
        </CardHeader>
        <CardContent className="py-6">
          <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm text-muted-foreground">
            {previewLines}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
