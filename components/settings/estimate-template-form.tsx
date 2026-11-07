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

import { SettingsCard } from '@/components/settings/settings-ui'
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
        form.reset(values)
        router.refresh()
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <SettingsCard
          title={t('Message')}
          description={t('Filled in when you share or copy an estimate. You can still edit it each time you send.')}
          footer={
            <Button type="submit" size="sm" disabled={isPending} className="min-w-28">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('Save message')}
            </Button>
          }
        >
          <div className="space-y-5">
              <FormField
                control={form.control}
                name="greeting"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Greeting')}</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder={TEMPLATE_DEFAULTS.greeting} {...field} />
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
                      <Textarea rows={3} placeholder={TEMPLATE_DEFAULTS.opener} {...field} />
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
                      <Textarea rows={3} placeholder={TEMPLATE_DEFAULTS.closer} {...field} />
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
                      <Textarea rows={3} placeholder={TEMPLATE_DEFAULTS.signature} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            <div className="rounded-[var(--radius-md)] bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {t('Variables you can use:')}{' '}
              <span className="font-mono text-foreground">{'{client_name}'}</span>,{' '}
              <span className="font-mono text-foreground">{'{company_name}'}</span>,{' '}
              <span className="font-mono text-foreground">{'{owner_name}'}</span>,{' '}
              <span className="font-mono text-foreground">{'{total}'}</span>
            </div>
          </div>
        </SettingsCard>
      </form>
    </Form>
  )
}
