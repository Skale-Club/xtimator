'use client'

import { useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { CompanySettings } from '@/lib/queries/company'
import { updateDeliverySettings } from '@/lib/actions/settings'

import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface DeliverySettingsFormProps {
  company: CompanySettings
}

interface FormValues {
  digitalSignatureEnabled: boolean
  emailDeliveryEnabled: boolean
  smsDeliveryEnabled: boolean
}

export function DeliverySettingsForm({ company }: DeliverySettingsFormProps) {
  const [isPending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    defaultValues: {
      digitalSignatureEnabled: company.digital_signature_enabled,
      emailDeliveryEnabled: company.email_delivery_enabled,
      smsDeliveryEnabled: company.sms_delivery_enabled,
    },
  })

  const values = useWatch({ control: form.control })

  function onSubmit(vals: FormValues) {
    startTransition(async () => {
      const result = await updateDeliverySettings(vals)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Delivery settings saved.')
      }
    })
  }

  return (
    <Card className="w-full rounded-[var(--radius-md)]">
      <CardContent className="py-6">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="flex min-h-24 items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-background p-4">
              <Label htmlFor="sig-enabled" className="grid flex-1 gap-1">
                <span>Digital signature</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Clients draw a signature before accepting the estimate.
                </span>
              </Label>
              <Switch
                id="sig-enabled"
                checked={!!values.digitalSignatureEnabled}
                onCheckedChange={(checked) => form.setValue('digitalSignatureEnabled', checked)}
              />
            </div>

            <div className="flex min-h-24 items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-background p-4">
              <Label htmlFor="email-delivery" className="grid flex-1 gap-1">
                <span>Email delivery</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Send estimate links to clients via email (Resend).
                </span>
              </Label>
              <Switch
                id="email-delivery"
                checked={!!values.emailDeliveryEnabled}
                onCheckedChange={(checked) => form.setValue('emailDeliveryEnabled', checked)}
              />
            </div>

            <div className="flex min-h-24 items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-background p-4">
              <Label htmlFor="sms-delivery" className="grid flex-1 gap-1">
                <span>SMS delivery</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Send estimate links to clients via SMS (Twilio).
                </span>
              </Label>
              <Switch
                id="sms-delivery"
                checked={!!values.smsDeliveryEnabled}
                onCheckedChange={(checked) => form.setValue('smsDeliveryEnabled', checked)}
              />
            </div>
          </div>

          <Button type="submit" disabled={isPending} className="min-w-40">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Delivery Settings
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
