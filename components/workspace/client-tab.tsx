'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { UserRound, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Card, CardContent } from '@/components/ui/card'
import { ClientPicker } from '@/components/clients/client-picker'
import { patchClientContactAction } from '@/lib/actions/client'
import type { ProjectDetail } from '@/lib/queries/project'
import { useTranslation } from '@/lib/i18n/use-translation'

interface ClientTabProps {
  project: ProjectDetail
}

export function ClientTab({ project }: ClientTabProps) {
  const client = project.client
  const { t } = useTranslation()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const form = useForm({
    values: {
      name: client?.name ?? '',
      email: client?.email ?? '',
      phone: client?.phone ?? '',
    },
  })

  function onSubmit(values: { name: string; email: string; phone: string }) {
    if (!client) return
    startTransition(async () => {
      const result = await patchClientContactAction(client.id, {
        name: values.name,
        email: values.email || null,
        phone: values.phone || null,
      })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('Client updated'))
        router.refresh()
      }
    })
  }

  if (!client) {
    return (
      <ClientPicker
        projectId={project.id}
        currentClientId={null}
        variant="card"
      />
    )
  }

  return (
    <div className="max-w-md space-y-4">
      <div className="flex items-center justify-between gap-2">
        {/* min-w-0 + shrink-0 on the avatar: a long client name wraps inside its
            own column instead of squashing the avatar circle into a pill. */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <UserRound className="h-4 w-4 text-muted-foreground" />
          </div>
          <h2 className="min-w-0 break-words text-base font-semibold">{client.name}</h2>
        </div>
        <Button variant="ghost" size="sm" asChild className="shrink-0 gap-1.5 text-muted-foreground">
          <a href={`/clients/${client.id}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            {t('Full profile')}
          </a>
        </Button>
      </div>

      <Card variant="glass">
        <CardContent className="p-5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                rules={{ required: t('Name is required') }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Name')}</FormLabel>
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
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? t('Saving...') : t('Save')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
