'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
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
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { ClientLogoUploader } from '@/components/clients/client-logo-uploader'
import { clientSchema, type ClientFormValues } from '@/lib/schemas/client'
import { createClientAction, updateClientAction } from '@/lib/actions/client'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'
import type { ClientDetail } from '@/lib/queries/clients'

interface ClientSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: ClientDetail | null
  companyId: string
}

export function ClientSheet({
  open,
  onOpenChange,
  client,
  companyId,
}: ClientSheetProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const isEditing = !!client

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema) as any,
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      notes: '',
    },
  })

  useEffect(() => {
    if (client) {
      form.reset({
        name: client.name,
        email: client.email ?? '',
        phone: client.phone ?? '',
        address: client.address ?? '',
        city: client.city ?? '',
        state: client.state ?? '',
        zip: client.zip ?? '',
        notes: client.notes ?? '',
      })
      setLogoPreview(client.logo_url ?? null)
      setLogoFile(null)
    } else {
      form.reset({
        name: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        zip: '',
        notes: '',
      })
      setLogoPreview(null)
      setLogoFile(null)
    }
  }, [client, form])

  async function uploadLogo(clientId: string, file: File): Promise<string | null> {
    const supabase = createBrowserClient()
    const storage = createStorage(supabase)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${companyId}/clients/${clientId}/logo.${ext}`

    try {
      await storage.upload('logos', path, file, { upsert: true })
    } catch (err) {
      console.error('Logo upload error:', err)
      return null
    }

    return storage.getPublicUrl('logos', path)
  }

  function onSubmit(values: ClientFormValues) {
    startTransition(async () => {
      if (isEditing && client) {
        // Edit mode
        let logoUrl = client.logo_url
        if (logoFile) {
          const url = await uploadLogo(client.id, logoFile)
          if (url) logoUrl = url
        }
        // If logo was removed (preview is null but client had a logo)
        if (!logoPreview && !logoFile) {
          logoUrl = null
        }

        const result = await updateClientAction(client.id, values)
        if (result.error) {
          toast.error(result.error)
          return
        }

        // Update logo_url if changed
        if (logoUrl !== client.logo_url) {
          const supabase = createBrowserClient()
          await supabase
            .from('clients')
            .update({ logo_url: logoUrl })
            .eq('id', client.id)
        }

        toast.success('Client updated')
      } else {
        // Create mode
        const result = await createClientAction(values)
        if (result.error) {
          toast.error(result.error)
          return
        }

        // Upload logo if selected
        if (logoFile && result.data?.id) {
          const url = await uploadLogo(result.data.id, logoFile)
          if (url) {
            const supabase = createBrowserClient()
            await supabase
              .from('clients')
              .update({ logo_url: url })
              .eq('id', result.data.id)
          }
        }

        toast.success('Client created')
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  const clientInitial = form.watch('name')?.charAt(0) || ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Client' : 'Add Client'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update client information.'
              : 'Add a new client to your database.'}
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
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Client name" {...field} />
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
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="Email address" {...field} />
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
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="Phone number" {...field} />
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
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="Street address" {...field} />
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
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="City" {...field} />
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
                    <FormLabel>State</FormLabel>
                    <FormControl>
                      <Input placeholder="State" {...field} />
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
                    <FormLabel>ZIP</FormLabel>
                    <FormControl>
                      <Input placeholder="ZIP code" {...field} />
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
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Notes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending
                ? isEditing
                  ? 'Updating...'
                  : 'Creating...'
                : isEditing
                  ? 'Update Client'
                  : 'Add Client'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
