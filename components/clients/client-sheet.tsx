'use client'

import { useRef, useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  useFormField,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ClientLogoUploader } from '@/components/clients/client-logo-uploader'
import { clientSchema, normalizeClientEmail, type ClientFormValues } from '@/lib/schemas/client'
import {
  createClientAction,
  removeClientLogo,
  updateClientAction,
  uploadClientLogoAction,
} from '@/lib/actions/client'
import type { ClientDetail } from '@/lib/queries/clients'
import { useTranslation } from '@/lib/i18n/use-translation'

interface ClientSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: ClientDetail | null
  companyId: string
  onCreated?: (clientId: string) => void | Promise<void>
}

const LANGUAGE_NOT_SET_VALUE = '__language_not_set__'

function ClientFormMessage({ className = '' }: { className?: string }) {
  const { error, formMessageId } = useFormField()
  const { t } = useTranslation()
  if (!error) return null
  return <p id={formMessageId} className={`text-sm font-medium text-[hsl(var(--destructive-text))] ${className}`}>{t(String(error.message))}</p>
}

export function ClientSheet(props: ClientSheetProps) {
  // Mount a fresh form when opened, with the existing values ready on the
  // first render. Closing/cancelling discards the draft without a refresh.
  return props.open ? <ClientSheetForm key={props.client?.id ?? 'new'} {...props} /> : null
}

function ClientSheetForm({ open, onOpenChange, client, onCreated }: ClientSheetProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(client?.logo_url ?? null)
  const isEditing = !!client

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    mode: 'onTouched',
    defaultValues: {
      name: client?.name ?? '',
      email: client?.email ?? '',
      phone: client?.phone ?? '',
      address: client?.address ?? '',
      city: client?.city ?? '',
      state: client?.state ?? '',
      zip: client?.zip ?? '',
      notes: client?.notes ?? '',
      preferred_language: (client?.preferred_language ?? '') as ClientFormValues['preferred_language'],
    },
  })

  async function uploadLogo(clientId: string, file: File): Promise<string | null> {
    const fd = new FormData()
    fd.set('file', file)
    const result = await uploadClientLogoAction(clientId, fd)
    if (result.error) {
      console.error('Logo upload error:', result.error)
      return null
    }
    return result.data?.url ?? null
  }

  function onSubmit(values: ClientFormValues) {
    startTransition(async () => {
      if (isEditing && client) {
        const result = await updateClientAction(client.id, values)
        if (result.error) {
          toast.error(result.error)
          return
        }

        if (logoFile) {
          // uploadClientLogoAction persists logo_url itself (server-side WebP conversion)
          await uploadLogo(client.id, logoFile)
        } else if (!logoPreview && client.logo_url) {
          const removeResult = await removeClientLogo(client.id)
          if (removeResult.error) {
            toast.error(removeResult.error)
            return
          }
        }

        toast.success(t('Client updated'))
      } else {
        const result = await createClientAction(values)
        if (result.error) {
          toast.error(result.error)
          return
        }

        // uploadClientLogoAction persists logo_url itself (server-side WebP conversion)
        if (logoFile && result.data?.id) await uploadLogo(result.data.id, logoFile)

        toast.success(t('Client created'))
        if (result.data?.id && onCreated) {
          try {
            await onCreated(result.data.id)
          } catch (error) {
            // Creation succeeded. Close the form so retrying a follow-up
            // operation cannot accidentally create a duplicate client.
            toast.error(error instanceof Error ? error.message : 'Could not finish linking the client.')
          }
        }
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  const clientInitial = useWatch({ control: form.control, name: 'name' })?.charAt(0) || ''

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isPending && !nextOpen) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        style={{ overflow: 'hidden' }}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (window.matchMedia?.('(pointer: coarse)').matches) titleRef.current?.focus()
          else form.setFocus('name')
        }}
        className="flex min-h-0 w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden bg-background p-0 backdrop-blur-none sm:w-[min(760px,calc(100vw-2rem))] sm:max-w-[760px] max-h-[calc(var(--app-vvh,100dvh)-1rem)] sm:max-h-[min(820px,calc(var(--app-vvh,100dvh)-2rem))]"
      >
        <DialogHeader className="shrink-0 border-b px-5 py-4 text-left sm:px-7">
          <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">{isEditing ? t('Edit Client') : t('Add Client')}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEditing ? t('Update client information.') : t('Add a new client to your database.')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form id="client-form" noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
              <fieldset disabled={isPending} className="min-w-0 space-y-7 [&_input]:h-11 [&_input]:text-base [&_textarea]:text-base sm:[&_input]:text-sm sm:[&_textarea]:text-sm">
                <section aria-label={t('Contact details')} className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem className="min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
                      <FormLabel className="col-span-2">{t('Name')} *</FormLabel>
                      <FormControl><Input autoComplete="name" aria-required placeholder={t('Client name')} {...field} /></FormControl>
                      <ClientLogoUploader
                        preview={logoPreview}
                        clientInitial={clientInitial}
                        onFileSelect={(file, preview) => {
                          setLogoFile(file)
                          setLogoPreview(preview)
                        }}
                        onRemove={() => {
                          setLogoFile(null)
                          setLogoPreview(null)
                        }}
                      />
                      <ClientFormMessage className="col-span-2" />
                    </FormItem>
                  )} />

                  <div className="grid min-w-0 grid-cols-1 items-start gap-4 sm:grid-cols-2">
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>{t('Email')}</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder={t('Email address')}
                            autoComplete="email"
                            inputMode="email"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            {...field}
                            onBlur={(event) => {
                              field.onChange(normalizeClientEmail(event.currentTarget.value ?? ''))
                              field.onBlur()
                            }}
                          />
                        </FormControl>
                        <ClientFormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>{t('Phone')}</FormLabel>
                        <FormControl><PhoneInput {...field} value={field.value ?? ''} /></FormControl>
                        <ClientFormMessage />
                      </FormItem>
                    )} />
                  </div>
                </section>

                <section aria-label={t('Address')} className="space-y-4 border-t pt-5">
                  <FormField control={form.control} name="address" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Street address')}</FormLabel>
                      <FormControl><Input autoComplete="street-address" placeholder={t('Street address')} {...field} /></FormControl>
                      <ClientFormMessage />
                    </FormItem>
                  )} />
                  <div className="grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
                    <FormField control={form.control} name="city" render={({ field }) => (
                      <FormItem className="col-span-2 min-w-0 sm:col-span-1">
                        <FormLabel>{t('City')}</FormLabel>
                        <FormControl><Input autoComplete="address-level2" placeholder={t('City')} {...field} /></FormControl>
                        <ClientFormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="state" render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>{t('State')}</FormLabel>
                        <FormControl><Input autoComplete="address-level1" placeholder={t('State')} {...field} /></FormControl>
                        <ClientFormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="zip" render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>{t('ZIP')}</FormLabel>
                        <FormControl><Input autoComplete="postal-code" placeholder={t('ZIP code')} {...field} /></FormControl>
                        <ClientFormMessage />
                      </FormItem>
                    )} />
                  </div>
                </section>

                <section aria-label={t('Preferences')} className="border-t pt-5">
                  <div className="grid items-start gap-4 sm:grid-cols-2">
                    <FormField control={form.control} name="preferred_language" render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>{t('Preferred estimate language')}</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === LANGUAGE_NOT_SET_VALUE ? '' : value)}
                          value={field.value || LANGUAGE_NOT_SET_VALUE}
                          disabled={isPending}
                        >
                          <FormControl><SelectTrigger className="min-h-11 w-full"><SelectValue placeholder={t('Not set (follows company default)')} /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value={LANGUAGE_NOT_SET_VALUE}>{t('Not set (follows company default)')}</SelectItem>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="pt">Português (Brazil)</SelectItem>
                            <SelectItem value="es">Español</SelectItem>
                          </SelectContent>
                        </Select>
                        <ClientFormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>{t('Notes')}</FormLabel>
                        <FormControl><Textarea placeholder={t('Notes...')} rows={3} {...field} /></FormControl>
                        <ClientFormMessage />
                      </FormItem>
                    )} />
                  </div>
                </section>
              </fieldset>
            </div>
            <div className="flex shrink-0 justify-end gap-3 border-t bg-background px-5 py-4 sm:px-7">
              <Button type="button" variant="outline" className="h-11" disabled={isPending} onClick={() => onOpenChange(false)}>
                {t('Cancel')}
              </Button>
              <Button type="submit" form="client-form" className="h-11" disabled={isPending}>
                {isPending
                  ? isEditing ? t('Updating...') : t('Creating...')
                  : isEditing ? t('Update Client') : t('Add Client')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
