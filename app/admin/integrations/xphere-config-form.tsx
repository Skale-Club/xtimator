'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { saveXphereBaseUrl } from './actions'

interface XphereConfigFormProps {
  current: string
}

export function XphereConfigForm({ current }: XphereConfigFormProps) {
  const [value, setValue] = useState(current)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await saveXphereBaseUrl(value)
      if (!result.ok) {
        toast.error(result.message)
      } else {
        toast.success('Xphere base URL saved.')
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Xphere Base URL</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Base origin of the Xphere deployment (no trailing path). Estimates sync to{' '}
          <code className="font-mono text-xs">/api/xtimator/webhook</code> under this origin.
          The integration stays disabled until both the API key and this URL are set.
        </p>
      </div>
      <div className="flex gap-3 items-end max-w-lg">
        <div className="flex-1 space-y-1">
          <Label htmlFor="xphere-base-url">Xphere Base URL</Label>
          <Input
            id="xphere-base-url"
            type="text"
            inputMode="url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://app.xphere.example"
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
