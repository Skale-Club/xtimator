'use client'

import { useState, useTransition } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { CompanySettings } from '@/lib/queries/company'
import { updateCompanySettings } from '@/lib/actions/settings'
import { INDUSTRIES } from '@/lib/industries'
import { SYSTEM_COLORS } from '@/lib/system-colors'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LogoUploader } from '@/components/onboarding/logo-uploader'
import { useTranslation } from '@/lib/i18n/use-translation'
import { DEFAULT_CURRENCY_CODE, SUPPORTED_CURRENCIES } from '@/lib/money/currency'

const companyInfoSchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  ownerName: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  website: z.string().optional().or(z.literal('')),
  industry: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  zip: z.string().optional().or(z.literal('')),
  licenseNumber: z.string().optional().or(z.literal('')),
  insuranceInfo: z.string().optional().or(z.literal('')),
  brandPrimaryColor: z.string().optional(),
  defaultEstimateLanguage: z.enum(['en', 'pt', 'es']).optional().or(z.literal('')),
  currencyCode: z.enum(['USD', 'BRL', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN', 'CHF', 'JPY', 'NZD']),
})

type CompanyInfoValues = z.infer<typeof companyInfoSchema>

interface CompanyInfoFormProps {
  company: CompanySettings
}

export function CompanyInfoForm({ company }: CompanyInfoFormProps) {
  const { t } = useTranslation()
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(company.logo_url)
  const [isPending, startTransition] = useTransition()

  const form = useForm<CompanyInfoValues>({
    resolver: zodResolver(companyInfoSchema) as Resolver<CompanyInfoValues>,
    defaultValues: {
      name: company.name || '',
      ownerName: company.owner_name || '',
      phone: company.phone || '',
      email: company.email || '',
      website: company.website || '',
      industry: company.industry || '',
      address: company.address || '',
      city: company.city || '',
      state: company.state || '',
      zip: company.zip || '',
      licenseNumber: company.license_number || '',
      insuranceInfo: company.insurance_info || '',
      brandPrimaryColor: company.brand_primary_color || SYSTEM_COLORS.primary,
      defaultEstimateLanguage: (company.default_estimate_language ?? '') as 'en' | 'pt' | 'es' | '',
      currencyCode: (company.currency_code ?? DEFAULT_CURRENCY_CODE) as CompanyInfoValues['currencyCode'],
    },
  })

  const companyName = useWatch({ control: form.control, name: 'name' })

  function onSubmit(values: CompanyInfoValues) {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('name', values.name)
      fd.set('ownerName', values.ownerName || '')
      fd.set('phone', values.phone || '')
      fd.set('email', values.email || '')
      fd.set('website', values.website || '')
      fd.set('industry', values.industry || '')
      fd.set('address', values.address || '')
      fd.set('city', values.city || '')
      fd.set('state', values.state || '')
      fd.set('zip', values.zip || '')
      fd.set('licenseNumber', values.licenseNumber || '')
      fd.set('insuranceInfo', values.insuranceInfo || '')
      fd.set('brandPrimaryColor', values.brandPrimaryColor || SYSTEM_COLORS.primary)
      fd.set('defaultEstimateLanguage', values.defaultEstimateLanguage || '')
      fd.set('currencyCode', values.currencyCode)
      fd.set('existingLogoUrl', logoPreview && !logoFile ? company.logo_url || '' : '')

      if (logoFile) {
        fd.set('logo', logoFile)
      }

      const result = await updateCompanySettings(fd)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('Company information saved.'))
      }
    })
  }

  return (
    <Card className="w-full rounded-[var(--radius-md)]">
      <CardHeader className="border-b border-border">
        <CardTitle>{t('Company Information')}</CardTitle>
        <CardDescription>
          {t('Keep the business details that appear across estimates, client links, and generated documents up to date.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="py-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid gap-8 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="flex items-center justify-center rounded-[var(--radius-md)] border border-dashed border-border bg-muted/30 p-6">
                <LogoUploader
                  preview={logoPreview}
                  companyInitial={companyName?.[0] || 'C'}
                  onFileSelect={(file, preview) => {
                    setLogoFile(file)
                    setLogoPreview(preview)
                  }}
                  onRemove={() => {
                    setLogoFile(null)
                    setLogoPreview(null)
                  }}
                />
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                {/* Company Name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="lg:col-span-2">
                      <FormLabel>{t('Company Name')} *</FormLabel>
                      <FormControl>
                        <Input placeholder={t('Your Company')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Owner Name */}
                <FormField
                  control={form.control}
                  name="ownerName"
                  render={({ field }) => (
                    <FormItem className="lg:col-span-2">
                      <FormLabel>{t('Owner Name')}</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Phone & Email */}
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Phone')}</FormLabel>
                      <FormControl>
                        <Input placeholder="(555) 123-4567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Email')}</FormLabel>
                      <FormControl>
                        <Input placeholder="info@company.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Website */}
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Website')}</FormLabel>
                      <FormControl>
                        <Input placeholder="https://company.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Industry */}
                <FormField
                  control={form.control}
                  name="industry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Industry')}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={t('Select industry')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {INDUSTRIES.map((ind) => (
                            <SelectItem key={ind.id} value={ind.id}>
                              {t(ind.label)}
                            </SelectItem>
                          ))}
                          <SelectItem value="other">{t('Other')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Default Estimate Language */}
                <FormField
                  control={form.control}
                  name="defaultEstimateLanguage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Default estimate language')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={t('English (default)')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="en">{t('English (default)')}</SelectItem>
                          <SelectItem value="pt">Português (Brazil)</SelectItem>
                          <SelectItem value="es">Español</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Currency */}
                <FormField
                  control={form.control}
                  name="currencyCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="USD - US Dollar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SUPPORTED_CURRENCIES.map((currency) => (
                            <SelectItem key={currency.code} value={currency.code}>
                              {currency.code} - {currency.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Address */}
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Address')}</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main St" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* City, State, Zip */}
            <div className="grid gap-5 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('City')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('City')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('State')}</FormLabel>
                    <FormControl>
                      <Input placeholder="CA" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="zip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Zip')}</FormLabel>
                    <FormControl>
                      <Input placeholder="90210" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* License & Insurance */}
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="licenseNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('License Number')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('License #')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="insuranceInfo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Insurance Info')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('Insurance details')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Brand Color */}
            <FormField
              control={form.control}
              name="brandPrimaryColor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Brand Color')}</FormLabel>
                  <div className="flex items-center gap-3">
                    <FormControl>
                      <input
                        type="color"
                        className="h-10 w-10 cursor-pointer rounded border"
                        value={field.value || SYSTEM_COLORS.primary}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <span className="text-sm text-muted-foreground font-mono">
                      {field.value || SYSTEM_COLORS.primary}
                    </span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isPending} className="min-w-40">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('Save Company Info')}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
