'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setGlobalOpenRouterModel } from './actions'
import { useTranslation } from '@/lib/i18n/use-translation'
import { OpenRouterModelSelector } from '@/components/admin/openrouter-model-selector'

type Props = {
  /** Platform-wide OpenRouter default model id (null when unset). */
  currentModel?: string | null
}

/**
 * Platform-wide default AI model.
 *
 * OpenRouter is the single AI engine — every estimate, photo analysis, and
 * translation routes through it (see lib/ai/index.ts). This selector sets the
 * default model used for any company that has no per-company override. There is
 * no "active provider" switch anymore: the Anthropic/Gemini adapters were
 * retired when all traffic moved to OpenRouter.
 */
export function OpenRouterModelForm({ currentModel }: Props) {
  const [model, setModel] = useState<string>(currentModel ?? '')
  const [isSaving, startTransition] = useTransition()
  const { t } = useTranslation()

  function handleSelect(modelId: string) {
    if (!modelId || modelId === model) return
    const previous = model
    setModel(modelId)
    startTransition(async () => {
      const result = await setGlobalOpenRouterModel(modelId)
      if (result.ok) {
        toast.success(result.message ?? t('Default model updated'))
      } else {
        toast.error(result.message)
        setModel(previous)
      }
    })
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div>
        <h3 className="font-medium text-sm">{t('Default AI model')}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t(
            'Every estimate, photo analysis, and translation runs on OpenRouter. This model is the platform default, used for any company without a per-company override. Applies immediately | no restart required.'
          )}
        </p>
      </div>
      <OpenRouterModelSelector
        value={model || null}
        onSelect={handleSelect}
        disabled={isSaving}
        placeholder={t('Select a model…')}
      />
    </div>
  )
}
