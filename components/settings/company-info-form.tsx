'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Pipette, Upload } from 'lucide-react'
import { toast } from 'sonner'

import type { CompanySettings } from '@/lib/queries/company'
import { updateCompanySettings } from '@/lib/actions/settings'
import { resolveIndustries, splitIndustries } from '@/lib/industries'
import { SYSTEM_COLORS } from '@/lib/system-colors'

import { Card, CardContent } from '@/components/ui/card'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IndustrySelector } from '@/components/onboarding/industry-selector'
import { useTranslation } from '@/lib/i18n/use-translation'

import { DEFAULT_CURRENCY_CODE, SUPPORTED_CURRENCIES } from '@/lib/money/currency'

const MAX_LOGO_SIZE = 2 * 1024 * 1024
const ACCEPTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg']

const companyInfoSchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  ownerName: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  website: z.string().optional().or(z.literal('')),
  industries: z.array(z.string()),
  customIndustries: z.array(z.string()),
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
  /** Render every field disabled and hide the save action (public demo). */
  readOnly?: boolean
}

export function CompanyInfoForm({ company, readOnly = false }: CompanyInfoFormProps) {
  const { t } = useTranslation()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(company.logo_url)
  const [isPending, startTransition] = useTransition()

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      toast.error('Unsupported format. Please upload a PNG or JPG.')
      return
    }
    if (file.size > MAX_LOGO_SIZE) {
      toast.error('Logo must be under 2MB.')
      return
    }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  // Split the persisted industries array back into multi-select state.
  // Falls back to the singular `industry` for rows not yet backfilled.
  const initialServices = useMemo(() => {
    const arr =
      company.industries && company.industries.length > 0
        ? company.industries
        : company.industry
          ? [company.industry]
          : []
    return splitIndustries(arr)
  }, [company.industries, company.industry])

  const [prefillNewServices, setPrefillNewServices] = useState(false)

  const form = useForm<CompanyInfoValues>({
    resolver: zodResolver(companyInfoSchema) as Resolver<CompanyInfoValues>,
    defaultValues: {
      name: company.name || '',
      ownerName: company.owner_name || '',
      phone: company.phone || '',
      email: company.email || '',
      website: company.website || '',
      industries: initialServices.selectedIds,
      customIndustries: initialServices.customIndustries,
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
  const watchedIndustries = useWatch({ control: form.control, name: 'industries' }) ?? []
  const watchedCustoms = useWatch({ control: form.control, name: 'customIndustries' }) ?? []

  const initialResolved = useMemo(
    () => resolveIndustries([...initialServices.selectedIds, ...initialServices.customIndustries]),
    [initialServices]
  )
  const currentResolved = resolveIndustries([...watchedIndustries, ...watchedCustoms])
  const addedServices = currentResolved.filter((v) => !initialResolved.includes(v))
  const showPrefill = !readOnly && addedServices.length > 0

  function onSubmit(values: CompanyInfoValues) {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('name', values.name)
      fd.set('ownerName', values.ownerName || '')
      fd.set('phone', values.phone || '')
      fd.set('email', values.email || '')
      fd.set('website', values.website || '')
      for (const id of values.industries) {
        fd.append('industries', id)
      }
      for (const custom of values.customIndustries) {
        fd.append('customIndustries', custom)
      }
      fd.set('prefillNewServices', prefillNewServices ? '1' : '')
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
      <CardContent className="py-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-8 border-0 p-0">

              {/* Logo + Brand Color — top two-column row */}
              <div className="grid gap-4 sm:grid-cols-2">

                {/* Logo card */}
                <div className="relative flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-dashed border-border">
                  <button
                    type="button"
                    aria-label="Upload company logo"
                    onClick={() => logoInputRef.current?.click()}
                    className="group relative flex min-h-[180px] flex-1 flex-col items-center justify-center gap-3 p-6 transition-colors hover:bg-muted/20"
                  >
                    {logoPreview ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoPreview}
                          alt="Company logo"
                          className="h-24 w-auto max-w-[200px] rounded-md object-contain"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="text-sm font-medium text-white">{t('Change logo')}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="rounded-full bg-muted p-4">
                          <Upload className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-foreground">{t('Company Logo')}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">PNG or JPG · max 2MB</p>
                        </div>
                      </>
                    )}
                  </button>

                  {logoPreview && (
                    <div className="flex items-center justify-center gap-4 border-t border-border bg-muted/10 py-2.5">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t('Change')}
                      </button>
                      <span className="text-xs text-muted-foreground/40">·</span>
                      <button
                        type="button"
                        onClick={() => { setLogoFile(null); setLogoPreview(null) }}
                        className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                      >
                        {t('Remove')}
                      </button>
                    </div>
                  )}

                  <input
                    ref={logoInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                </div>

                {/* Brand Color card */}
                <FormField
                  control={form.control}
                  name="brandPrimaryColor"
                  render={({ field }) => (
                    <FormItem className="m-0">
                      <label className="group relative flex min-h-[180px] cursor-pointer flex-col overflow-hidden rounded-[var(--radius-md)] border border-border">
                        <div
                          className="relative flex-1"
                          style={{ backgroundColor: field.value || SYSTEM_COLORS.primary }}
                        >
                          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                            <Pipette className="h-4 w-4 text-white" />
                            <span className="text-sm font-medium text-white">{t('Change color')}</span>
                          </div>
                          <FormControl>
                            <input
                              type="color"
                              className="sr-only"
                              value={field.value || SYSTEM_COLORS.primary}
                              onChange={field.onChange}
                            />
                          </FormControl>
                        </div>
                        <div className="border-t border-border bg-card/50 px-4 py-3">
                          <p className="text-xs text-muted-foreground">{t('Brand Color')}</p>
                          <p className="mt-0.5 font-mono text-sm font-semibold tracking-wide">
                            {(field.value || SYSTEM_COLORS.primary).toUpperCase()}
                          </p>
                        </div>
                      </label>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Main fields */}
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
                      <FormDescription className="text-xs text-muted-foreground">
                        {t('Appears on generated estimates when the owner name is included.')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Phone, Email & Website — same row on desktop */}
                <div className="lg:col-span-2 grid gap-5 lg:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Phone')}</FormLabel>
                        <FormControl>
                          <PhoneInput
                            value={field.value ?? ''}
                            onChange={field.onChange}
                            placeholder="(555) 123-4567"
                          />
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
                </div>

                {/* Services (multi-select) */}
                <FormItem className="lg:col-span-2">
                  <FormLabel>{t('Services')}</FormLabel>
                  <FormDescription className="text-xs text-muted-foreground">
                    {t('Select all the services your business offers. Used to tailor estimates and price-book starters.')}
                  </FormDescription>
                  <div className="mt-2">
                    <IndustrySelector
                      value={watchedIndustries}
                      customValues={watchedCustoms}
                      onChange={(ids) =>
                        form.setValue('industries', ids, { shouldDirty: true })
                      }
                      onCustomChange={(customs) =>
                        form.setValue('customIndustries', customs, { shouldDirty: true })
                      }
                    />
                  </div>
                  {showPrefill && (
                    <label
                      htmlFor="settings-prefill"
                      className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3"
                    >
                      <Checkbox
                        id="settings-prefill"
                        checked={prefillNewServices}
                        onCheckedChange={(checked) => setPrefillNewServices(checked === true)}
                        className="mt-0.5"
                      />
                      <span className="text-sm">
                        <span className="font-medium text-foreground">
                          {t('Add starter prices for the service(s) you just added.')}
                        </span>{' '}
                        <span className="text-muted-foreground">
                          {t("We'll add common services and average market prices for the newly selected service(s). These are starting points — edit them anytime.")}
                        </span>
                      </span>
                    </label>
                  )}
                </FormItem>

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

            </fieldset>

            {readOnly ? (
              <p className="text-sm text-muted-foreground">
                {t('This is a read-only demo. Create a free account to edit your profile.')}
              </p>
            ) : (
              <Button type="submit" disabled={isPending} className="min-w-40">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('Save Company Info')}
              </Button>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
