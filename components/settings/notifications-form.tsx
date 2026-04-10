'use client'

import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { CompanySettings } from '@/lib/queries/company'
import { updateNotifications } from '@/lib/actions/settings'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card>
      <CardHeader>
        <CardTitle>Email Notifications</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="notify-view" className="flex-1">
                Notify when estimate is viewed
              </Label>
              <Switch
                id="notify-view"
                checked={form.watch('notifyOnView')}
                onCheckedChange={(checked) => form.setValue('notifyOnView', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="notify-accept" className="flex-1">
                Notify when estimate is accepted
              </Label>
              <Switch
                id="notify-accept"
                checked={form.watch('notifyOnAccept')}
                onCheckedChange={(checked) => form.setValue('notifyOnAccept', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="notify-decline" className="flex-1">
                Notify when estimate is declined
              </Label>
              <Switch
                id="notify-decline"
                checked={form.watch('notifyOnDecline')}
                onCheckedChange={(checked) => form.setValue('notifyOnDecline', checked)}
              />
            </div>
          </div>

          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Notifications
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
