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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'

interface EstimateTemplateFormProps {
  company: CompanySettings
}

export function EstimateTemplateForm({ company }: EstimateTemplateFormProps) {
  const { t } = useTranslation()
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
        toast.success(t('Template saved.'))
        router.refresh()
      }
    })
  }

  return (
    <Card className="w-full rounded-[var(--radius-md)]">
      <CardHeader className="border-b border-border">
        <CardTitle>{t('Message Template')}</CardTitle>
        <CardDescription>
          {t('Default message pre-filled when you copy or share an estimate. Edit it per-estimate in the send flow.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="py-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

            <FormField
              control={form.control}
              name="greeting"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Greeting')}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder={TEMPLATE_DEFAULTS.greeting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="opener"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Opening')}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder={TEMPLATE_DEFAULTS.opener}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="closer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Closing')}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder={TEMPLATE_DEFAULTS.closer}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="signature"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Sign-off')}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder={TEMPLATE_DEFAULTS.signature}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <p className="text-xs text-muted-foreground">
              {t('Available variables:')}{' '}
              <span className="font-mono">{'{client_name}'}</span>,{' '}
              <span className="font-mono">{'{company_name}'}</span>,{' '}
              <span className="font-mono">{'{owner_name}'}</span>,{' '}
              <span className="font-mono">{'{total}'}</span>
            </p>

            <Button type="submit" disabled={isPending} className="min-w-40">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('Save')}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
