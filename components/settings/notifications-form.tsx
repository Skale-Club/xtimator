'use client'

import { useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { CompanySettings } from '@/lib/queries/company'
import { updateNotifications } from '@/lib/actions/settings'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface NotificationsFormProps {
  company: CompanySettings
}

interface NotificationValues {
  notifyOnView: boolean
  notifyOnAccept: boolean
  notifyOnDecline: boolean
}

export function NotificationsForm({ company }: NotificationsFormProps) {
  const [isPending, startTransition] = useTransition()

  const form = useForm<NotificationValues>({
    defaultValues: {
      notifyOnView: company.notify_on_view,
      notifyOnAccept: company.notify_on_accept,
      notifyOnDecline: company.notify_on_decline,
    },
  })
  const notificationValues = useWatch({ control: form.control })

  function onSubmit(values: NotificationValues) {
    startTransition(async () => {
      const result = await updateNotifications(values)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Notification preferences saved.')
      }
    })
  }

  return (
    <Card className="w-full rounded-[var(--radius-md)]">
      <CardHeader className="border-b border-border">
        <CardTitle>Email Notifications</CardTitle>
        <CardDescription>
          Choose which estimate activity should notify you by email.
        </CardDescription>
      </CardHeader>
      <CardContent className="py-6">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="flex min-h-24 items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-background p-4">
              <Label htmlFor="notify-view" className="grid flex-1 gap-1">
                <span>Estimate viewed</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Know when a client opens the shared estimate.
                </span>
              </Label>
              <Switch
                id="notify-view"
                checked={!!notificationValues.notifyOnView}
                onCheckedChange={(checked) => form.setValue('notifyOnView', checked)}
              />
            </div>

            <div className="flex min-h-24 items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-background p-4">
              <Label htmlFor="notify-accept" className="grid flex-1 gap-1">
                <span>Estimate accepted</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Get notified as soon as work is approved.
                </span>
              </Label>
              <Switch
                id="notify-accept"
                checked={!!notificationValues.notifyOnAccept}
                onCheckedChange={(checked) => form.setValue('notifyOnAccept', checked)}
              />
            </div>

            <div className="flex min-h-24 items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-background p-4">
              <Label htmlFor="notify-decline" className="grid flex-1 gap-1">
                <span>Estimate declined</span>
                <span className="text-sm font-normal text-muted-foreground">
                  See declines quickly so follow-up stays timely.
                </span>
              </Label>
              <Switch
                id="notify-decline"
                checked={!!notificationValues.notifyOnDecline}
                onCheckedChange={(checked) => form.setValue('notifyOnDecline', checked)}
              />
            </div>
          </div>

          <Button type="submit" disabled={isPending} className="min-w-40">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Notifications
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
