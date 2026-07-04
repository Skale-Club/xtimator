'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { brandingSchema, type BrandingInput } from '@/lib/schemas/admin'
import { SYSTEM_COLORS } from '@/lib/system-colors'
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
import { Button } from '@/components/ui/button'
import { LogoUploader } from '@/components/onboarding/logo-uploader'
import { PrimaryColorPicker } from '@/components/admin/primary-color-picker'

import { saveBranding } from './actions'
import { BrandingPreviewCard, type PreviewBranding } from './branding-preview-card'
import { useTranslation } from '@/lib/i18n/use-translation'

export type EditorBranding = {
  appName: string
  logoUrl: string | null
  primaryColor: string | null
  emailFromName: string | null
  faviconUrl: string | null
}

interface BrandingEditorProps {
  initial: EditorBranding
}

const DEFAULT_COLOR = SYSTEM_COLORS.primary

export function BrandingEditor({ initial }: BrandingEditorProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { t } = useTranslation()

  // Lifted state for live preview + logo file (kept outside RHF so the
  // uploader's local objectURL flow can drive the preview before submit).
  const [logoPreview, setLogoPreview] = useState<string | null>(initial.logoUrl)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [faviconFile, setFaviconFile] = useState<File | null>(null)

  const form = useForm<BrandingInput>({
    // zod v4 + RHF generic mismatch — same cast pattern as
    // company-info-form / onboarding-wizard already in this codebase.
    resolver: zodResolver(brandingSchema) as never,
    defaultValues: {
      appName: initial.appName,
      primaryColor: initial.primaryColor ?? DEFAULT_COLOR,
      emailFromName: initial.emailFromName ?? '',
      logoFile: null,
    },
  })

  const [watchedAppName, watchedColor] = useWatch({
    control: form.control,
    name: ['appName', 'primaryColor'],
  })

  const livePreview: PreviewBranding = {
    appName: watchedAppName ?? initial.appName,
    logoUrl: logoPreview,
    primaryColor: watchedColor ?? initial.primaryColor,
  }

  function handleLogoSelect(file: File, preview: string) {
    setLogoFile(file)
    setLogoPreview(preview)
    form.setValue('logoFile', file, { shouldDirty: true })
  }

  function handleLogoRemove() {
    setLogoFile(null)
    setLogoPreview(null)
    form.setValue('logoFile', null, { shouldDirty: true })
  }

  function onSubmit(values: BrandingInput) {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('appName', values.appName)
      fd.set('primaryColor', values.primaryColor ?? '')
      fd.set('emailFromName', values.emailFromName ?? '')
      if (logoFile) fd.set('logoFile', logoFile)
      if (faviconFile) fd.set('faviconFile', faviconFile)

      const result = await saveBranding(fd)
      if (result.ok) {
        toast.success(t('Branding updated.'))
        router.refresh()
      } else if ('errors' in result) {
        toast.error(t('Couldn’t save branding. Check the form for errors.'))
      } else {
        toast.error(`${t('Couldn’t save branding.')} ${result.message}`)
      }
    })
  }

  const companyInitial = (initial.appName || 'X').charAt(0).toUpperCase()

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <FormField
            control={form.control}
            name="appName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Application name')}</FormLabel>
                <FormControl>
                  <Input
                    id="appName"
                    placeholder="Xtimator"
                    autoComplete="off"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormDescription>
                  {t('Shown on auth pages, admin header, browser tab, and platform email headers.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormItem>
            <FormLabel>{t('Logo')}</FormLabel>
            <FormControl>
              <LogoUploader
                preview={logoPreview}
                companyInitial={companyInitial}
                onFileSelect={handleLogoSelect}
                onRemove={handleLogoRemove}
              />
            </FormControl>
            <FormDescription>
              {t('Square PNG or JPG, under 2MB. Shown above the sign-in form and in the admin header.')}
            </FormDescription>
          </FormItem>

          <FormItem>
            <FormLabel>{t('Favicon')}</FormLabel>
            <FormControl>
              <input
                type="file"
                accept=".ico,.png,.svg"
                className="text-sm"
                onChange={(e) => setFaviconFile(e.target.files?.[0] ?? null)}
              />
            </FormControl>
            <FormDescription>
              {t('ICO or PNG, under 1MB. Shown in browser tabs. If set, overrides the static favicon file.')}
            </FormDescription>
            {initial.faviconUrl && (
              <a
                href={initial.faviconUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline"
              >
                {t('Current favicon')}
              </a>
            )}
          </FormItem>

          <FormField
            control={form.control}
            name="primaryColor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Primary color')}</FormLabel>
                <div className="flex items-center gap-3">
                  <FormControl>
                    <PrimaryColorPicker
                      value={field.value || DEFAULT_COLOR}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <Input
                    type="text"
                    className="w-32 font-mono"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    placeholder={DEFAULT_COLOR}
                    autoComplete="off"
                  />
                </div>
                <FormDescription>
                  {t('Accents buttons and focus rings on auth pages and admin tools.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="emailFromName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Email sender name')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Xtimator Team"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormDescription>
                  {t("Appears as the sender on platform emails (welcome, password reset). Tenant estimates still send under each company's name.")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('Save branding')}
            </Button>
          </div>
        </form>
      </Form>

      <BrandingPreviewCard branding={livePreview} />
    </div>
  )
}
