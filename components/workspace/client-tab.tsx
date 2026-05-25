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
import { LinkClientCard } from './link-client-card'
import { patchClientContactAction } from '@/lib/actions/client'
import type { ProjectDetail } from '@/lib/queries/project'

interface ClientTabProps {
  project: ProjectDetail
}

export function ClientTab({ project }: ClientTabProps) {
  const client = project.client
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const form = useForm({
    defaultValues: {
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
        toast.success('Client updated')
        router.refresh()
      }
    })
  }

  if (!client) {
    return <LinkClientCard projectId={project.id} />
  }

  return (
    <div className="max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
            <UserRound className="h-4 w-4 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold">{client.name}</h2>
        </div>
        <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
          <a href={`/clients/${client.id}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            Full profile
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
                rules={{ required: 'Name is required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
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
                      <PhoneInput
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        placeholder="Phone number"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? 'Saving...' : 'Save'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
