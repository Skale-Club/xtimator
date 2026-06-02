'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { saveWhatsAppConfig } from './actions'

interface WhatsAppConfigFormProps {
  currentPhoneNumberId: string
  currentWabaId: string
}

export function WhatsAppConfigForm({
  currentPhoneNumberId,
  currentWabaId,
}: WhatsAppConfigFormProps) {
  const [phoneNumberId, setPhoneNumberId] = useState(currentPhoneNumberId)
  const [wabaId, setWabaId] = useState(currentWabaId)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await saveWhatsAppConfig({ phoneNumberId, wabaId })
      if (!result.ok) {
        toast.error(result.message)
      } else {
        toast.success('WhatsApp config saved.')
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">WhatsApp Platform Config</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Phone Number ID and WhatsApp Business Account ID from the Meta Business dashboard.
          These are non-secret identifiers required for sending messages.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
        <div className="space-y-1">
          <Label htmlFor="wa-phone-number-id">Phone Number ID</Label>
          <Input
            id="wa-phone-number-id"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="123456789012345"
            disabled={isPending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wa-waba-id">WhatsApp Business Account ID</Label>
          <Input
            id="wa-waba-id"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            placeholder="123456789012345"
            disabled={isPending}
          />
        </div>
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
  )
}
