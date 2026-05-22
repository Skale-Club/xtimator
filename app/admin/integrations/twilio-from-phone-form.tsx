'use client'

import { useState, useTransition } from 'react'
import { PhoneInput } from '@/components/ui/phone-input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { saveTwilioFromPhone } from './actions'

interface TwilioFromPhoneFormProps {
  current: string
}

export function TwilioFromPhoneForm({ current }: TwilioFromPhoneFormProps) {
  const [value, setValue] = useState(current)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await saveTwilioFromPhone(value)
      if (!result.ok) {
        toast.error(result.message)
      } else {
        toast.success('Twilio from phone saved.')
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Outbound Phone Number</h3>
        <p className="text-sm text-muted-foreground mt-1">
          The Twilio number SMS messages are sent from. Must be in E.164 format (e.g.{' '}
          <code className="font-mono text-xs">+15551234567</code>).
        </p>
      </div>
      <div className="flex gap-3 items-end max-w-sm">
        <div className="flex-1 space-y-1">
          <Label htmlFor="twilio-from-phone">From phone</Label>
          <PhoneInput
            id="twilio-from-phone"
            value={value}
            onChange={(formatted) => {
              // saveTwilioFromPhone expects E.164 — strip mask chars
              setValue(formatted.replace(/[^\d+]/g, ''))
            }}
            placeholder="+15551234567"
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
