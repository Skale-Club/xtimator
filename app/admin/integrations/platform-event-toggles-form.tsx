'use client'

import { useState, useTransition } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { savePlatformEventToggle } from './platform-event-actions'
import type { PlatformEventToggleRow } from '@/lib/admin/platform-event-preferences'

interface Props {
  initial: PlatformEventToggleRow[]
}

const CATEGORY_LABELS: Record<string, string> = {
  tenant: 'Tenant Activity',
  job_failure: 'Job Failures',
  critical: 'Critical / Reliability',
}

export function PlatformEventTogglesForm({ initial }: Props) {
  const [rows, setRows] = useState(initial)
  const [isPending, startTransition] = useTransition()

  function toggle(kind: string, next: boolean) {
    setRows((prev) => prev.map((r) => (r.kind === kind ? { ...r, enabled: next } : r)))
    startTransition(async () => {
      const result = await savePlatformEventToggle({ kind, enabled: next })
      if (!result.ok) {
        toast.error(result.message)
        setRows((prev) => prev.map((r) => (r.kind === kind ? { ...r, enabled: !next } : r)))
      }
    })
  }

  const grouped = rows.reduce<Record<string, PlatformEventToggleRow[]>>((acc, r) => {
    ;(acc[r.category] ??= []).push(r)
    return acc
  }, {})

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold">Per-Event Telegram Toggles</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Turn individual platform events on or off for Telegram delivery. Critical events
          (lock icon) always deliver and cannot be disabled — Sentry still records every
          event regardless of these toggles.
        </p>
      </div>
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABELS[category] ?? category}
          </h4>
          <div className="divide-y divide-border/60 rounded-md border border-border/60">
            {items.map((row) => (
              <div key={row.kind} className="flex items-center justify-between gap-4 px-3 py-2.5">
                <Label htmlFor={`toggle-${row.kind}`} className="flex items-center gap-2 text-sm font-normal">
                  {row.locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                  {row.label}
                </Label>
                <Switch
                  id={`toggle-${row.kind}`}
                  checked={row.enabled}
                  disabled={row.locked || isPending}
                  onCheckedChange={(checked) => toggle(row.kind, checked)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
