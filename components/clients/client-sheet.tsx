'use client'

import { useState, useTransition } from 'react'
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
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ClientLogoUploader } from '@/components/clients/client-logo-uploader'
import { clientSchema, type ClientFormValues } from '@/lib/schemas/client'
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

export function ClientSheet(props: ClientSheetProps) {
  // Mount a fresh form when opened, with the existing values ready on the
  // first render. Closing/cancelling discards the draft without a refresh.
  return props.open ? <ClientSheetForm key={props.client?.id ?? 'new'} {...props} /> : null
}

function ClientSheetForm({
  open,
  onOpenChange,
  client,
  onCreated,
}: ClientSheetProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(client?.logo_url ?? null)
  const isEditing = !!client

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
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
        // Edit mode
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

        toast.success('Client updated')
      } else {
        // Create mode
        const result = await createClientAction(values)
        if (result.error) {
          toast.error(result.error)
          return
        }

        // uploadClientLogoAction persists logo_url itself (server-side WebP conversion)
        if (logoFile && result.data?.id) {
          await uploadLogo(result.data.id, logoFile)
        }

        toast.success('Client created')
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-4xl max-h-[90dvh] grid-cols-[minmax(0,1fr)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('Edit Client') : t('Add Client')}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? t('Update client information.')
              : t('Add a new client to your database.')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Logo Upload */}
            <div className="flex justify-center pb-2">
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
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Name')} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t('Client name')} {...field} />
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
                    <Input type="email" placeholder={t('Email address')} autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                      placeholder={t('Phone number')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Address')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('Street address')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-3">
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
                      <Input placeholder={t('State')} {...field} />
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
                    <FormLabel>{t('ZIP')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('ZIP code')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Notes')}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t('Notes...')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="preferred_language"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Preferred estimate language')}</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value === LANGUAGE_NOT_SET_VALUE ? '' : value)
                    }}
                    value={field.value || LANGUAGE_NOT_SET_VALUE}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('Not set (follows company default)')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={LANGUAGE_NOT_SET_VALUE}>{t('Not set (follows company default)')}</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="pt">Português (Brazil)</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending
                ? isEditing
                  ? t('Updating...')
                  : t('Creating...')
                : isEditing
                  ? t('Update Client')
                  : t('Add Client')}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
