'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { saveTwilioCustomerMessagingServiceSid } from './actions'

interface TwilioCustomerMessagingFormProps {
  current: string
}

export function TwilioCustomerMessagingForm({ current }: TwilioCustomerMessagingFormProps) {
  const [value, setValue] = useState(current)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await saveTwilioCustomerMessagingServiceSid(value)
      if (!result.ok) {
        toast.error(result.message)
      } else {
        toast.success('Customer Messaging Service saved.')
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Customer Messaging Service</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Dedicated Twilio Messaging Service used ONLY for end-customer SMS — kept
          separate from the shared owner-notification number above so end-customer
          traffic can never affect the number&apos;s shared reputation. Leave blank
          to disable end-customer SMS entirely (no fallback to the number above).
        </p>
      </div>
      <div className="flex gap-3 items-end max-w-sm">
        <div className="flex-1 space-y-1">
          <Label htmlFor="twilio-customer-messaging-service-sid">Messaging Service SID</Label>
          <Input
            id="twilio-customer-messaging-service-sid"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value.trim())}
            placeholder="MG…"
            disabled={isPending}
          />
        </div>
        <Button onClick={handleSave} disabled={isPending} className="min-h-[44px]">
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>
    </div>
  )
}
