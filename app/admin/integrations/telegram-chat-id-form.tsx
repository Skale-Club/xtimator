'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { saveTelegramChatId, sendTelegramTestAlert } from './actions'
import { TestButton } from './test-button'

interface TelegramChatIdFormProps {
  current: string
}

export function TelegramChatIdForm({ current }: TelegramChatIdFormProps) {
  const [value, setValue] = useState(current)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await saveTelegramChatId(value)
      if (!result.ok) {
        toast.error(result.message)
      } else {
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
      <div className="flex gap-3 items-end max-w-sm">
        <div className="flex-1 space-y-1">
          <Label htmlFor="telegram-chat-id">Chat ID</Label>
          <Input
            id="telegram-chat-id"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d-]/g, ''))}
            placeholder="123456789"
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
      <div>
        <TestButton onRun={() => sendTelegramTestAlert()} />
      </div>
    </div>
  )
}
