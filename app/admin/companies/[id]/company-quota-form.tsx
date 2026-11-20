'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsSaveBar } from '@/components/settings/settings-ui'
import { setDemoEstimateQuota } from '../actions'

type Props = {
  companyId: string
  initialQuota: number | null
}

export function CompanyQuotaForm({ companyId, initialQuota }: Props) {
  const [saved, setSaved] = useState(initialQuota !== null ? String(initialQuota) : '')
  const [value, setValue] = useState(saved)
  const [pending, startTransition] = useTransition()
  const dirty = value.trim() !== saved.trim()

  function save() {
    const parsed = value.trim() === '' ? null : parseInt(value.trim(), 10)
    if (value.trim() !== '' && (isNaN(parsed!) || parsed! < 0)) {
      toast.error('Enter a non-negative integer, or leave blank to remove the limit.')
      return
    }

    startTransition(async () => {
      const result = await setDemoEstimateQuota(companyId, parsed ?? null)
      if (result.ok) {
        setSaved(value.trim())
        toast.success(result.message ?? 'Saved')
      } else {
        toast.error(result.message)
        setValue(saved)
      }
    })
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
      <Input
        type="number"
        min={0}
        placeholder="Unlimited"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
        className="w-32 font-mono"
      />
      {value !== '' && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            setValue('')
            startTransition(async () => {
              const result = await setDemoEstimateQuota(companyId, null)
              if (result.ok) {
                setSaved('')
                toast.success(result.message ?? 'Quota removed')
              }
              else toast.error(result.message)
            })
          }}
        >
          Remove limit
        </Button>
      )}
      </div>
      <SettingsSaveBar dirty={dirty} pending={pending} onDiscard={() => setValue(saved)} onSave={save} />
    </div>
  )
}
