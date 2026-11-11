'use client'

import { useTransition } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'

import type { CompanySettings } from '@/lib/queries/company'
import { updateDefaults, updateDeliverySettings, updateEstimateTerms } from '@/lib/actions/settings'
import { updateDocumentBlocks } from '@/lib/actions/document-blocks'
import { hasText, parseDocumentBlocks } from '@/lib/estimate/document-blocks'

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  SettingsCard,
  SettingsRow,
  SettingsRows,
  SettingsSaveBar,
  SettingsStack,
} from '@/components/settings/settings-ui'
import { useTranslation } from '@/lib/i18n/use-translation'

/*
 * Everything that shapes a new estimate, in one form with one save: pricing
 * defaults, the terms printed on it, and how it reaches the client. This
 * replaces three separate forms (defaults, terms, delivery) that each had
 * their own save button, and the "Require digital signature" switch that
 * lived in two of them.
 */

const schema = z.object({
  defaultTaxRate: z.coerce.number().min(0, 'Must be 0 or more').max(100, 'Must be 100 or less'),
  defaultValidityDays: z.coerce.number().int().min(1, 'Must be at least 1 day'),
  defaultPaymentTerms: z.string().optional().or(z.literal('')),
  defaultWarrantyTerms: z.string().optional().or(z.literal('')),
  estimateTermsEnabled: z.boolean(),
  estimateTermsText: z.string(),
  digitalSignatureEnabled: z.boolean(),
  emailDeliveryEnabled: z.boolean(),
  smsDeliveryEnabled: z.boolean(),
  // SEED-056 document blocks (company defaults for NEW estimates).
  blockSummary: z.boolean(),
  blockPayment: z.boolean(),
  blockWarranty: z.boolean(),
  blockTimeline: z.boolean(),
  blockNotes: z.boolean(),
  blockPhotos: z.boolean(),
  blockValidUntil: z.boolean(),
})

type Values = z.infer<typeof schema>

type SwitchName =
  | 'digitalSignatureEnabled'
  | 'emailDeliveryEnabled'
  | 'smsDeliveryEnabled'
  | 'estimateTermsEnabled'
  | 'blockSummary'
  | 'blockPayment'
  | 'blockWarranty'
  | 'blockTimeline'
  | 'blockNotes'
  | 'blockPhotos'
  | 'blockValidUntil'

function initialValues(company: CompanySettings): Values {
  const blocks = parseDocumentBlocks(company.document_blocks)
  return {
    // Shown as a percentage; stored as a 0-1 decimal.
    defaultTaxRate: Number(company.default_tax_rate) * 100,
    defaultValidityDays: company.default_validity_days || 30,
    defaultPaymentTerms: company.default_payment_terms || '',
    defaultWarrantyTerms: company.default_warranty_terms || '',
    estimateTermsEnabled: company.estimate_terms_enabled,
    estimateTermsText: company.estimate_terms_text ?? '',
    digitalSignatureEnabled: company.digital_signature_enabled,
    emailDeliveryEnabled: company.email_delivery_enabled,
    smsDeliveryEnabled: company.sms_delivery_enabled,
    // Absent key = system default: summary and photos on, text blocks on when
    // the company has the text, the rest off.
    blockSummary: blocks.summary ?? true,
    blockPayment: blocks.payment_terms ?? hasText(company.default_payment_terms),
    blockWarranty: blocks.warranty_terms ?? hasText(company.default_warranty_terms),
    blockTimeline: blocks.timeline ?? false,
    blockNotes: blocks.notes ?? false,
    blockPhotos: blocks.photos ?? true,
    blockValidUntil: blocks.valid_until ?? false,
  }
}

export function EstimateSettingsForm({ company }: { company: CompanySettings }) {
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()

  const form = useForm<Values>({
    resolver: zodResolver(schema) as Resolver<Values>,
    defaultValues: initialValues(company),
  })

  const termsEnabled = useWatch({ control: form.control, name: 'estimateTermsEnabled' })
  const paymentOn = useWatch({ control: form.control, name: 'blockPayment' })
  const warrantyOn = useWatch({ control: form.control, name: 'blockWarranty' })

  function onSubmit(values: Values) {
    startTransition(async () => {
      // updateDefaults and updateEstimateTerms each read-merge-write
      // companies.document_blocks (their text→flag sync), and so does
      // updateDocumentBlocks. Run them one after another, with the explicit
      // block switches LAST, so the owner's choices are what ends up stored
      // (in parallel the last writer would win at random).
      const results: Array<{ error?: string }> = await Promise.all([
        updateDefaults({
          defaultTaxRate: values.defaultTaxRate / 100,
          defaultPaymentTerms: values.defaultPaymentTerms || '',
          defaultWarrantyTerms: values.defaultWarrantyTerms || '',
          defaultValidityDays: values.defaultValidityDays,
        }),
        // Delivery touches no document_blocks key, so it can run alongside.
        updateDeliverySettings({
          digitalSignatureEnabled: values.digitalSignatureEnabled,
          emailDeliveryEnabled: values.emailDeliveryEnabled,
          smsDeliveryEnabled: values.smsDeliveryEnabled,
        }),
      ])
      results.push(
        await updateEstimateTerms({
          estimateTermsEnabled: values.estimateTermsEnabled,
          estimateTermsText: values.estimateTermsText,
        })
      )
      results.push(
        // A text block is only on when it has text; switching it off keeps the
        // text in the company defaults (non-destructive).
        await updateDocumentBlocks({
          summary: values.blockSummary,
          payment_terms: values.blockPayment && hasText(values.defaultPaymentTerms),
          warranty_terms: values.blockWarranty && hasText(values.defaultWarrantyTerms),
          timeline: values.blockTimeline,
          notes: values.blockNotes,
          photos: values.blockPhotos,
          estimate_terms: values.estimateTermsEnabled && hasText(values.estimateTermsText),
          valid_until: values.blockValidUntil,
        })
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) {
        toast.error(failed.error)
        return
      }
      toast.success(t('Estimate settings saved.'))
      form.reset(values)
    })
  }

  const switchField = (name: SwitchName, id: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} />
      )}
    />
  )

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <SettingsStack>
          <SettingsCard
            title={t('Pricing')}
            description={t('Applied to every new estimate. You can still change them on each one.')}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="defaultTaxRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Tax rate')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type="number" inputMode="decimal" step="0.01" min="0" max="100" placeholder="0" className="pr-8" {...field} />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                    </FormControl>
                    <FormDescription>{t('Filled in from your state during setup. Change it if your local rules differ.')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultValidityDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Valid for')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type="number" inputMode="numeric" min="1" placeholder="30" className="pr-14" {...field} />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{t('days')}</span>
                      </div>
                    </FormControl>
                    <FormDescription>{t('How long the client has to accept after you create it.')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </SettingsCard>

          <SettingsCard
            title={t('Document blocks')}
            description={t('What a new estimate starts with. Anything left off can be added on each estimate with one click.')}
          >
            <div className="space-y-5">
              <SettingsRows>
                <SettingsRow
                  htmlFor="block-summary"
                  label={t('AI summary')}
                  description={t('A short scope summary written from your walkthrough.')}
                >
                  {switchField('blockSummary', 'block-summary')}
                </SettingsRow>
                <SettingsRow
                  htmlFor="block-payment"
                  label={t('Payment terms')}
                  description={t('Your own text, copied onto every new estimate.')}
                >
                  {switchField('blockPayment', 'block-payment')}
                </SettingsRow>
              </SettingsRows>
              {paymentOn && (
                <FormField
                  control={form.control}
                  name="defaultPaymentTerms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">{t('Payment terms')}</FormLabel>
                      <FormControl>
                        <Textarea placeholder={t('50% deposit, balance due on completion')} rows={4} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <SettingsRows>
                <SettingsRow
                  htmlFor="block-warranty"
                  label={t('Warranty')}
                  description={t('Your own text, copied onto every new estimate.')}
                >
                  {switchField('blockWarranty', 'block-warranty')}
                </SettingsRow>
              </SettingsRows>
              {warrantyOn && (
                <FormField
                  control={form.control}
                  name="defaultWarrantyTerms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">{t('Warranty')}</FormLabel>
                      <FormControl>
                        <Textarea placeholder={t('1 year warranty on labor and materials')} rows={4} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <SettingsRows>
                <SettingsRow
                  htmlFor="terms-enabled"
                  label={t('Terms and conditions')}
                  description={t('Add your own terms text below the payment and warranty terms.')}
                >
                  {switchField('estimateTermsEnabled', 'terms-enabled')}
                </SettingsRow>
              </SettingsRows>
              {termsEnabled && (
                <FormField
                  control={form.control}
                  name="estimateTermsText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">{t('Terms text')}</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={6}
                          placeholder={t('All work follows local building codes. A 50% deposit is required before work begins.')}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <SettingsRows className="border-t border-[var(--glass-border)] pt-4">
                <SettingsRow
                  htmlFor="block-timeline"
                  label={t('Timeline')}
                  description={t('Let the AI propose a timeline when your walkthrough mentions dates or durations.')}
                >
                  {switchField('blockTimeline', 'block-timeline')}
                </SettingsRow>
                <SettingsRow
                  htmlFor="block-notes"
                  label={t('Notes')}
                  description={t('Let the AI add notes about assumptions the client should know.')}
                >
                  {switchField('blockNotes', 'block-notes')}
                </SettingsRow>
                <SettingsRow
                  htmlFor="block-photos"
                  label={t('Photos')}
                  description={t('Show the photos you attach to an estimate.')}
                >
                  {switchField('blockPhotos', 'block-photos')}
                </SettingsRow>
                <SettingsRow
                  htmlFor="block-valid-until"
                  label={t('Valid until')}
                  description={t('Show the date the estimate expires, based on "Valid for" above.')}
                >
                  {switchField('blockValidUntil', 'block-valid-until')}
                </SettingsRow>
              </SettingsRows>
            </div>
          </SettingsCard>

          <SettingsCard
            title={t('Sending and signature')}
            description={t('How estimates reach your clients and how they accept them.')}
          >
            <SettingsRows>
              <SettingsRow
                htmlFor="email-delivery"
                label={t('Send by email')}
                description={t('Email the estimate link to the client.')}
              >
                {switchField('emailDeliveryEnabled', 'email-delivery')}
              </SettingsRow>
              <SettingsRow
                htmlFor="sms-delivery"
                label={t('Send by text message')}
                description={t('Text the estimate link to the client.')}
              >
                {switchField('smsDeliveryEnabled', 'sms-delivery')}
              </SettingsRow>
              <SettingsRow
                htmlFor="sig-enabled"
                label={t('Online approval with signature')}
                description={t("Clients can accept the estimate on its page by drawing their signature. When off, the page has no accept buttons and you record the client's answer in the app.")}
              >
                {switchField('digitalSignatureEnabled', 'sig-enabled')}
              </SettingsRow>
            </SettingsRows>
          </SettingsCard>
        </SettingsStack>

        <SettingsSaveBar
          className="mt-6"
          dirty={form.formState.isDirty}
          pending={isPending}
          onDiscard={() => form.reset()}
          saveLabel={t('Save changes')}
          savingLabel={t('Saving…')}
          unsavedLabel={t('Unsaved changes')}
          savedLabel={t('All changes saved')}
          discardLabel={t('Discard')}
        />
      </form>
    </Form>
  )
}
