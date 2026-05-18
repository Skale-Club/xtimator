'use client'

import { useState, useTransition } from 'react'
import { setActiveAIProvider } from './actions'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/use-translation'

type Props = { current: 'anthropic' | 'gemini' }

export function AIProviderSelector({ current }: Props) {
  const [selected, setSelected] = useState(current)
  const [isPending, startTransition] = useTransition()
  const { t } = useTranslation()

  function handleChange(provider: 'anthropic' | 'gemini') {
    setSelected(provider)
    startTransition(async () => {
      const result = await setActiveAIProvider(provider)
      if (result.ok) {
        toast.success(result.message ?? t('Provider updated'))
      } else {
        toast.error(result.message)
        setSelected(current)  // revert on error
      }
    })
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div>
        <h3 className="font-medium text-sm">{t('Active AI Provider')}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('Controls which AI is used for estimate generation. Takes effect immediately — no restart required.')}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {(['anthropic', 'gemini'] as const).map(provider => (
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
            <span className="text-sm capitalize">
              {provider === 'anthropic' ? 'Anthropic (Claude)' : 'Google Gemini'}
            </span>
            {selected === provider && (
              <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5">{t('Active')}</span>
            )}
          </label>
        ))}
      </div>
    </div>
  )
}
