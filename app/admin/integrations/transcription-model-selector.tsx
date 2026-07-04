'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setGlobalTranscriptionModel } from './actions'
import { useTranslation } from '@/lib/i18n/use-translation'

type Props = {
  /** Platform-wide speech-to-text model id (defaults to whisper-1 when unset). */
  current: string
}

// Known OpenAI transcription models, in display order. Kept local (not imported
// from the server-only platform-config module) because this is a client
// component — mirrors how AIProviderSelector holds its own label list. The
// server action re-validates the id against the platform allowlist (the source
// of truth), so a stale entry here can never persist an invalid model.
const MODELS = [
  {
    id: 'whisper-1',
    label: 'Whisper v1',
    hint: 'Classic, lowest cost, universally available.',
  },
  {
    id: 'gpt-4o-mini-transcribe',
    label: 'GPT-4o mini transcribe',
    hint: 'Higher accuracy than Whisper at a modest cost bump.',
  },
  {
    id: 'gpt-4o-transcribe',
    label: 'GPT-4o transcribe',
    hint: 'Best accuracy for noisy audio and accents; highest cost.',
  },
] as const

/**
 * Super-admin selector for the platform-wide speech-to-text model.
 *
 * Transcription does NOT route through OpenRouter — it calls OpenAI Whisper
 * directly (see transcribeAudioOR) — so the choice is a fixed list of known
 * OpenAI transcription models rather than the 340-model OpenRouter search.
 * Changing the per-minute cost for a pricier model is done in the Billing tab.
 */
export function TranscriptionModelSelector({ current }: Props) {
  const [model, setModel] = useState<string>(current)
  const [isPending, startTransition] = useTransition()
  const { t } = useTranslation()

  function handleSelect(next: string) {
    if (next === model) return
    const previous = model
    setModel(next)
    startTransition(async () => {
      const result = await setGlobalTranscriptionModel(next)
      if (result.ok) {
        toast.success(result.message ?? t('Speech-to-text model updated'))
      } else {
        toast.error(result.message)
        setModel(previous)
      }
    })
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div>
        <h3 className="font-medium text-sm">{t('Speech-to-text model')}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t(
            'Model used to transcribe audio walkthroughs. Applies immediately | no restart required. Set the per-minute cost in the Billing tab.'
          )}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {MODELS.map((m) => (
          <label
            key={m.id}
            className="flex items-start gap-2 cursor-pointer"
          >
            <input
              type="radio"
              name="transcription-model"
              value={m.id}
              checked={model === m.id}
              onChange={() => handleSelect(m.id)}
              disabled={isPending}
              className="accent-primary mt-0.5"
            />
            <span className="flex flex-col">
              <span className="text-sm flex items-center gap-2">
                {m.label}
                {model === m.id && (
                  <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5">
                    {t('Active')}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(m.hint)}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
