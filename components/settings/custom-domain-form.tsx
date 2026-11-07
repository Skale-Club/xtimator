'use client'

import { useState, useTransition } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { customDomainSchema, type CustomDomainFormValues } from '@/lib/schemas/custom-domain'
import { saveCustomDomain } from '@/lib/actions/custom-domain'

import { SettingsCard, SettingsStack } from '@/components/settings/settings-ui'
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

interface CustomDomainFormProps {
  settings: { id: string; custom_domain: string | null }
}

export function CustomDomainForm({ settings }: CustomDomainFormProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Track savedDomain locally so DNS card updates immediately after save
  // without waiting for router.refresh() round-trip.
  const [savedDomain, setSavedDomain] = useState<string | null>(settings.custom_domain)

  const form = useForm<CustomDomainFormValues>({
    resolver: zodResolver(customDomainSchema) as Resolver<CustomDomainFormValues>,
    defaultValues: {
      custom_domain: settings.custom_domain ?? '',
    },
  })

  function onSubmit(values: CustomDomainFormValues) {
    startTransition(async () => {
      const result = await saveCustomDomain({
        custom_domain: values.custom_domain || null,
      })
      if ('error' in result) {
        toast.error(result.error)
      } else {
        // Update local state immediately before router.refresh()
        setSavedDomain(values.custom_domain || null)
        toast.success('Domain saved.')
        router.refresh()
      }
    })
  }

  // Apex detection: 2-part domain = apex (e.g. "mycompany.com")
  // Subdomain: 3+ parts (e.g. "estimates.mycompany.com")
  const isApex = savedDomain ? savedDomain.split('.').length === 2 : false
  const subdomainPart = savedDomain
    ? savedDomain.split('.').slice(0, -2).join('.') || savedDomain
    : ''

  return (
    <SettingsStack>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsCard
            title="Domain"
            description="Leave it empty to stop using a custom domain."
            footer={
              <Button type="submit" size="sm" disabled={isPending} className="min-w-28">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save domain
              </Button>
            }
          >
            <FormField
              control={form.control}
              name="custom_domain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hostname</FormLabel>
                  <FormControl>
                    <Input placeholder="estimates.mycompany.com" {...field} />
                  </FormControl>
                  <FormDescription>
                    A subdomain like <code className="text-xs">estimates.mycompany.com</code> or a domain like{' '}
                    <code className="text-xs">mycompany.com</code>, without <code className="text-xs">https://</code>.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SettingsCard>
        </form>
      </Form>

      {savedDomain && (
        <SettingsCard title="DNS record" description="Add this record where you bought your domain.">
          <div className="space-y-4">
            <div className="space-y-1 rounded-md bg-muted p-4 font-mono text-sm">
              <p><span className="text-muted-foreground">Type:</span> {isApex ? 'A' : 'CNAME'}</p>
              <p><span className="text-muted-foreground">Name:</span> {isApex ? '@' : subdomainPart}</p>
              <p><span className="text-muted-foreground">Value:</span> {isApex ? '188.245.112.3' : 'xtimator.com'}</p>
              <p><span className="text-muted-foreground">TTL:</span> Auto / 3600</p>
            </div>
            <p className="text-sm text-muted-foreground">
              DNS changes can take 24 to 48 hours. The SSL certificate is issued automatically once the record resolves.
            </p>
          </div>
        </SettingsCard>
      )}
    </SettingsStack>
  )
}
