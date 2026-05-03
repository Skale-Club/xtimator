'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { brandingSchema, type BrandingInput } from '@/lib/schemas/admin'
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

import { saveBranding } from './actions'
import { BrandingPreviewCard, type PreviewBranding } from './branding-preview-card'

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

const DEFAULT_COLOR = '#0D9488'

export function BrandingEditor({ initial }: BrandingEditorProps) {
  const [isPending, startTransition] = useTransition()

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

  // Watch the form so the preview updates on every keystroke / color change.
  const watchedAppName = form.watch('appName')
  const watchedColor = form.watch('primaryColor')

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
        toast.success('Branding updated.')
      } else if ('errors' in result) {
        toast.error('Couldn’t save branding. Check the form for errors.')
      } else {
        toast.error(`Couldn’t save branding. ${result.message}`)
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
                <FormLabel>Application name</FormLabel>
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
                  Shown on auth pages, admin header, browser tab, and platform email
                  headers.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormItem>
            <FormLabel>Logo</FormLabel>
            <FormControl>
              <LogoUploader
                preview={logoPreview}
                companyInitial={companyInitial}
                onFileSelect={handleLogoSelect}
                onRemove={handleLogoRemove}
              />
            </FormControl>
            <FormDescription>
              Square PNG or JPG, under 2MB. Shown above the sign-in form and in the
              admin header.
            </FormDescription>
          </FormItem>

          <FormItem>
            <FormLabel>Favicon</FormLabel>
            <FormControl>
              <input
                type="file"
                accept=".ico,.png,.svg"
                className="text-sm"
                onChange={(e) => setFaviconFile(e.target.files?.[0] ?? null)}
              />
            </FormControl>
            <FormDescription>
              ICO or PNG, under 1MB. Shown in browser tabs. If set, overrides the
              static favicon file.
            </FormDescription>
            {initial.faviconUrl && (
              <a
                href={initial.faviconUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline"
              >
                Current favicon
              </a>
            )}
          </FormItem>

          <FormField
            control={form.control}
            name="primaryColor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Primary color</FormLabel>
                <div className="flex items-center gap-3">
                  <FormControl>
                    <input
                      type="color"
                      className="h-10 w-10 cursor-pointer rounded border border-border"
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
                  />
                </div>
                <FormDescription>
                  Accents buttons and focus rings on auth pages and admin tools.
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
                <FormLabel>Email sender name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Xtimator Team"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormDescription>
                  Appears as the sender on platform emails (welcome, password reset).
                  Tenant estimates still send under each company&apos;s name.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save branding
            </Button>
          </div>
        </form>
      </Form>

      <BrandingPreviewCard branding={livePreview} />
    </div>
  )
}
