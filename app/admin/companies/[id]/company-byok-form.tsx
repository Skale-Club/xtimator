'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { setByokConfig } from '../actions'

type Props = {
  companyId: string
  byokEnabled: boolean
  keyLast4: string | null
}

/**
 * Billing v2 BYOK — super-admin control (the hidden "street-sale" plan).
 * Paste a company's own OpenRouter key to enable; disable to bill normally.
 * The key is write-only: once saved, only the last-4 hint is ever shown.
 */
export function CompanyByokForm({ companyId, byokEnabled, keyLast4 }: Props) {
  const [value, setValue] = useState('')
  const [pending, startTransition] = useTransition()

  function save() {
    if (value.trim().length < 20) {
      toast.error('Paste the full OpenRouter API key (sk-or-…).')
      return
    }
    startTransition(async () => {
      const result = await setByokConfig(companyId, value.trim())
      if (result.ok) {
        toast.success(result.message ?? 'BYOK enabled')
        setValue('')
      } else {
        toast.error(result.message)
      }
    })
  }

  function disable() {
    startTransition(async () => {
      const result = await setByokConfig(companyId, null)
      if (result.ok) toast.success(result.message ?? 'BYOK disabled')
      else toast.error(result.message)
    })
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {byokEnabled
          ? `BYOK is ON (key …${keyLast4 ?? '????'}) — this company runs on its own OpenRouter key and spends no platform credits.`
          : 'BYOK is OFF — this company bills platform credits normally. Paste its own OpenRouter key to enable.'}
      </p>
      <div className="flex items-center gap-3">
        <Input
          type="password"
          placeholder={byokEnabled ? 'Paste a new key to rotate…' : 'sk-or-…'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          className="w-72 font-mono"
          autoComplete="off"
        />
        <Button type="button" size="sm" disabled={pending || value.trim() === ''} onClick={save}>
          {pending ? 'Saving…' : byokEnabled ? 'Rotate key' : 'Enable BYOK'}
        </Button>
        {byokEnabled && (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={disable}>
            Disable BYOK
          </Button>
        )}
      </div>
    </div>
  )
}
