'use client'

import { useState, useTransition } from 'react'
import { setActiveAIProvider, setGlobalOpenRouterModel } from './actions'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/use-translation'
import { OpenRouterModelSelector } from '@/components/admin/openrouter-model-selector'

type SelectedAIProvider = 'anthropic' | 'gemini' | 'openrouter'

type Props = {
  current: SelectedAIProvider
  /** Platform-wide OpenRouter default model id (only meaningful when current === 'openrouter'). */
  currentOpenRouterModel?: string | null
}

const PROVIDER_LABELS: Record<SelectedAIProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter (multi-model)',
}

export function AIProviderSelector({ current, currentOpenRouterModel }: Props) {
  const [selected, setSelected] = useState<SelectedAIProvider>(current)
  const [model, setModel] = useState<string>(currentOpenRouterModel ?? '')
  const [isPending, startTransition] = useTransition()
  const [isSavingModel, startModelTransition] = useTransition()
  const { t } = useTranslation()

  function handleChange(provider: SelectedAIProvider) {
    setSelected(provider)
    startTransition(async () => {
      const result = await setActiveAIProvider(provider)
      if (result.ok) {
        toast.success(result.message ?? t('Provider updated'))
      } else {
        toast.error(result.message)
        setSelected(current)
      }
    })
  }

  function handleModelSelect(modelId: string) {
    if (!modelId) return
    setModel(modelId)
    startModelTransition(async () => {
      const result = await setGlobalOpenRouterModel(modelId)
      if (result.ok) {
        toast.success(result.message ?? t('Default model updated'))
      } else {
        toast.error(result.message)
        setModel(currentOpenRouterModel ?? '')
      }
    })
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div>
        <h3 className="font-medium text-sm">{t('Active AI Provider')}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t(
            'Controls which AI is used for estimate generation. Takes effect immediately — no restart required.'
          )}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {(['anthropic', 'gemini', 'openrouter'] as const).map((provider) => (
          <label key={provider} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="ai-provider"
              value={provider}
              checked={selected === provider}
              onChange={() => handleChange(provider)}
              disabled={isPending}
              className="accent-primary"
            />
            <span className="text-sm">{PROVIDER_LABELS[provider]}</span>
            {selected === provider && (
              <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5">
                {t('Active')}
              </span>
            )}
          </label>
        ))}
      </div>

      {selected === 'openrouter' && (
        <div className="pt-3 border-t space-y-2">
          <div>
            <h4 className="text-sm font-medium">{t('Default OpenRouter model')}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                'Used when a company has no per-company model override. Search by name or model id.'
              )}
            </p>
          </div>
          <OpenRouterModelSelector
            value={model || null}
            onSelect={handleModelSelect}
            disabled={isSavingModel}
            placeholder={t('Select a model…')}
          />
        </div>
      )}
    </div>
  )
}
