'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { SettingsSaveBar } from '@/components/settings/settings-ui'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { saveWhatsAppConfig } from './actions'

interface WhatsAppConfigFormProps {
  currentPhoneNumberId: string
  currentWabaId: string
  currentDisplayNumber?: string
}

export function WhatsAppConfigForm({
  currentPhoneNumberId,
  currentWabaId,
  currentDisplayNumber = '',
}: WhatsAppConfigFormProps) {
  const [phoneNumberId, setPhoneNumberId] = useState(currentPhoneNumberId)
  const [wabaId, setWabaId] = useState(currentWabaId)
  const [displayNumber, setDisplayNumber] = useState(currentDisplayNumber)
  const [saved, setSaved] = useState({
    phoneNumberId: currentPhoneNumberId,
    wabaId: currentWabaId,
    displayNumber: currentDisplayNumber,
  })
  const [isPending, startTransition] = useTransition()
  const dirty =
    phoneNumberId !== saved.phoneNumberId ||
    wabaId !== saved.wabaId ||
    displayNumber !== saved.displayNumber

  function handleSave() {
    startTransition(async () => {
      const result = await saveWhatsAppConfig({ phoneNumberId, wabaId, displayNumber })
      if (!result.ok) {
        toast.error(result.message)
      } else {
        setSaved({ phoneNumberId, wabaId, displayNumber })
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
      <div className="grid gap-6 sm:grid-cols-2 max-w-2xl">
        <div className="grid gap-2">
          <Label htmlFor="wa-phone-number-id">Phone Number ID</Label>
          <Input
            id="wa-phone-number-id"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="123456789012345"
            disabled={isPending}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="wa-waba-id">WhatsApp Business Account ID</Label>
          <Input
            id="wa-waba-id"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            placeholder="123456789012345"
            disabled={isPending}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="wa-display-number">Display Number (E.164)</Label>
          <Input
            id="wa-display-number"
            value={displayNumber}
            onChange={(e) => setDisplayNumber(e.target.value)}
            placeholder="+15551234567"
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            The public WhatsApp number customers message. Used to build the
            &ldquo;Get Started on WhatsApp&rdquo; link in welcome emails.
          </p>
        </div>
      </div>
      <SettingsSaveBar
        dirty={dirty}
        pending={isPending}
        onDiscard={() => {
          setPhoneNumberId(saved.phoneNumberId)
          setWabaId(saved.wabaId)
          setDisplayNumber(saved.displayNumber)
        }}
        onSave={handleSave}
      />
    </div>
  )
}
