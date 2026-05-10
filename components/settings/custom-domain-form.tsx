'use client'

import { useState, useTransition } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { customDomainSchema, type CustomDomainFormValues } from '@/lib/schemas/custom-domain'
import { saveCustomDomain } from '@/lib/actions/custom-domain'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
    <div className="space-y-6">
      <Card className="w-full rounded-[var(--radius-md)]">
        <CardHeader className="border-b border-border">
          <CardTitle>Domain Configuration</CardTitle>
          <CardDescription>
            Enter your custom hostname. Leave empty to remove the custom domain.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="custom_domain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom Domain</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="estimates.mycompany.com"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Enter a subdomain (e.g. <code className="text-xs">estimates.mycompany.com</code>) or
                      an apex domain (e.g. <code className="text-xs">mycompany.com</code>).
                      Do not include <code className="text-xs">https://</code>.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={isPending} className="min-w-40">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Domain
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {savedDomain && (
        <Card className="w-full rounded-[var(--radius-md)]">
          <CardHeader className="border-b border-border">
            <CardTitle>DNS Setup Instructions</CardTitle>
            <CardDescription>
              Add the following DNS record at your domain registrar.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-6 space-y-4">
            {isApex ? (
              <div className="rounded-md bg-muted p-4 text-sm font-mono space-y-1">
                <p><span className="text-muted-foreground">Type:</span> A</p>
                <p><span className="text-muted-foreground">Name:</span> @</p>
                <p><span className="text-muted-foreground">Value:</span> 76.76.21.21</p>
                <p><span className="text-muted-foreground">TTL:</span> Auto / 3600</p>
              </div>
            ) : (
              <div className="rounded-md bg-muted p-4 text-sm font-mono space-y-1">
                <p><span className="text-muted-foreground">Type:</span> CNAME</p>
                <p><span className="text-muted-foreground">Name:</span> {subdomainPart}</p>
                <p><span className="text-muted-foreground">Value:</span> cname.vercel-dns-0.com</p>
                <p><span className="text-muted-foreground">TTL:</span> Auto / 3600</p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              DNS changes can take up to 24&ndash;48 hours to propagate.
              Vercel automatically provisions an SSL certificate once the record resolves.
              Confirm exact values in your{' '}
              <a
                href="https://vercel.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Vercel project&apos;s Domains settings
              </a>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
