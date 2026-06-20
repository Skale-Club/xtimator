'use client'

import { useTransition } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { CompanySettings } from '@/lib/queries/company'
import { updateDefaults } from '@/lib/actions/settings'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'

const defaultsSchema = z.object({
  defaultTaxRate: z.coerce.number().min(0, 'Must be 0 or more').max(100, 'Must be 100 or less'),
  defaultPaymentTerms: z.string().optional().or(z.literal('')),
  defaultWarrantyTerms: z.string().optional().or(z.literal('')),
  defaultValidityDays: z.coerce.number().int().min(1, 'Must be at least 1 day'),
})

type DefaultsValues = z.infer<typeof defaultsSchema>

interface DefaultsFormProps {
  company: CompanySettings
}

export function DefaultsForm({ company }: DefaultsFormProps) {
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()

  const form = useForm<DefaultsValues>({
    resolver: zodResolver(defaultsSchema) as Resolver<DefaultsValues>,
    defaultValues: {
      // Display as percentage (DB stores as decimal 0-1)
      defaultTaxRate: Number(company.default_tax_rate) * 100,
      defaultPaymentTerms: company.default_payment_terms || '',
      defaultWarrantyTerms: company.default_warranty_terms || '',
      defaultValidityDays: company.default_validity_days || 30,
    },
  })

  function onSubmit(values: DefaultsValues) {
    startTransition(async () => {
      const result = await updateDefaults({
        defaultTaxRate: values.defaultTaxRate / 100, // Convert percentage to decimal
        defaultPaymentTerms: values.defaultPaymentTerms || '',
        defaultWarrantyTerms: values.defaultWarrantyTerms || '',
        defaultValidityDays: values.defaultValidityDays,
      })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('Estimate defaults saved.'))
      }
    })
  }

  return (
    <Card className="w-full rounded-[var(--radius-md)]">
      <CardHeader className="border-b border-border">
        <CardTitle>{t('Estimate Defaults')}</CardTitle>
        <CardDescription>
          {t('Set the reusable terms and calculation defaults applied when new estimates are created.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="py-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Tax Rate */}
              <FormField
                control={form.control}
                name="defaultTaxRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Default Tax Rate (%)')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          placeholder="0"
                          {...field}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          %
                        </span>
                      </div>
                    </FormControl>
                    <FormDescription>{t('Auto-filled from your state and service type during setup. Adjust if your local rules differ. Applied to new estimates by default.')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Validity Days */}
              <FormField
                control={form.control}
                name="defaultValidityDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Estimate Validity Period')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="number"
                          min="1"
                          placeholder="30"
                          {...field}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          {t('days')}
                        </span>
                      </div>
                    </FormControl>
                    <FormDescription>{t('How long estimates are valid after creation.')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Payment Terms */}
              <FormField
                control={form.control}
                name="defaultPaymentTerms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Payment Terms')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('Net 30')}
                        rows={6}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Warranty Terms */}
              <FormField
                control={form.control}
                name="defaultWarrantyTerms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Warranty Terms')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('1 year warranty on labor and materials')}
                        rows={6}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" disabled={isPending} className="min-w-40">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('Save Defaults')}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
