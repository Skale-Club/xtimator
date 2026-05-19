'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { OpenRouterModelSelector } from '@/components/admin/openrouter-model-selector'
import { setCompanyModelOverride } from '../actions'

type Props = {
  companyId: string
  initialModel: string | null
}

export function CompanyModelOverrideForm({ companyId, initialModel }: Props) {
  const [model, setModel] = useState<string | null>(initialModel)
  const [pending, startTransition] = useTransition()

  function persist(next: string | null) {
    setModel(next)
    startTransition(async () => {
      const result = await setCompanyModelOverride(companyId, next)
      if (result.ok) {
        toast.success(result.message ?? 'Saved')
      } else {
        toast.error(result.message)
        setModel(initialModel)
      }
    })
  }

  return (
    <div className="space-y-3">
      <OpenRouterModelSelector
        value={model}
        onSelect={(id) => persist(id || null)}
        disabled={pending}
        allowClear
        placeholder="Select a model to pin this company…"
      />
      {model && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-mono">{model}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => persist(null)}
          >
            Clear override
          </Button>
        </div>
      )}
    </div>
  )
}
