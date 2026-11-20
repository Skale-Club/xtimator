'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { SettingsSaveBar } from '@/components/settings/settings-ui'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { saveTelegramChatId, sendTelegramTestAlert } from './actions'
import { TestButton } from './test-button'

interface TelegramChatIdFormProps {
  current: string
}

export function TelegramChatIdForm({ current }: TelegramChatIdFormProps) {
  const [value, setValue] = useState(current)
  const [saved, setSaved] = useState(current)
  const [isPending, startTransition] = useTransition()
  const dirty = value !== saved

  function handleSave() {
    startTransition(async () => {
      const result = await saveTelegramChatId(value)
      if (!result.ok) {
        toast.error(result.message)
      } else {
        setSaved(value)
        toast.success('Telegram chat ID saved.')
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Alert Destination (chat_id)</h3>
        <p className="text-sm text-muted-foreground mt-1">
          The Telegram chat that receives ops alerts. Message your bot once, then read the
          numeric id from <code className="font-mono text-xs">getUpdates</code>. Groups use a
          negative id.
        </p>
      </div>
      <div className="grid gap-2 max-w-sm">
        <div className="grid gap-2">
          <Label htmlFor="telegram-chat-id">Chat ID</Label>
          <Input
            id="telegram-chat-id"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d-]/g, ''))}
            placeholder="123456789"
            disabled={isPending}
          />
        </div>
      </div>
      <div>
        <TestButton onRun={() => sendTelegramTestAlert()} />
      </div>
      <SettingsSaveBar dirty={dirty} pending={isPending} onDiscard={() => setValue(saved)} onSave={handleSave} />
    </div>
  )
}
