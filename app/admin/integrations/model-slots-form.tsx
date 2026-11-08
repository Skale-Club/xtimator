'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setModelSlot, setEscalationConfig } from './actions'
import { useTranslation } from '@/lib/i18n/use-translation'

type Slot = 'vision' | 'plan' | 'draft' | 'research' | 'review'

/** Current stored values (already validated at read time on the server). */
type Props = {
  models: Partial<Record<Slot, string>>
  escalation: {
    enabled: boolean
    model: string
    minTotalUsd?: number
    minSections?: number
    onLowScopeConfidence?: boolean
  } | null
}

const HAIKU = 'anthropic/claude-haiku-5.5'
const SONNET = 'anthropic/claude-sonnet-5.5'
const OPUS = 'anthropic/claude-opus-5.5'

// Slot list, label, hint and allowed options. Mirrors lib/ai/model-policy.ts
// (vision/plan/review accept Haiku; draft/research do not). The server action
// re-validates, so a stale entry here can never persist a disallowed model.
const SLOTS: Array<{ slot: Slot; label: string; hint: string; options: string[] }> = [
  {
    slot: 'vision',
    label: 'Photo analysis',
    hint: 'Default: Sonnet. Choosing Haiku analyzes with Haiku first and escalates to Sonnet when the result is weak.',
    options: [HAIKU, SONNET, OPUS],
  },
  {
    slot: 'plan',
    label: 'Scope plan (two-step)',
    hint: 'Default: Haiku. Only used when two-step generation is on.',
    options: [HAIKU, SONNET, OPUS],
  },
  {
    slot: 'draft',
    label: 'Estimate draft',
    hint: 'Default: the platform default model above. A per-company override still wins.',
    options: [SONNET, OPUS],
  },
  {
    slot: 'research',
    label: 'Price research',
    hint: 'Default: the platform default model above.',
    options: [SONNET, OPUS],
  },
  {
    slot: 'review',
    label: 'Needs-details review',
    hint: 'Default: Haiku.',
    options: [HAIKU, SONNET, OPUS],
  },
]

const DEFAULT_VALUE = ''

function SlotSelect({
  slot,
  label,
  hint,
  options,
  current,
}: {
  slot: Slot
  label: string
  hint: string
  options: string[]
  current: string
}) {
  const [value, setValue] = useState(current)
  const [isSaving, startTransition] = useTransition()
  const { t } = useTranslation()
  // A stored model outside the curated list still shows as selected.
  const all = value && !options.includes(value) ? [...options, value] : options

  function onChange(next: string) {
    const previous = value
    setValue(next)
    startTransition(async () => {
      const result = await setModelSlot(slot, next)
      if (result.ok) {
        toast.success(result.message ?? t('Model updated'))
      } else {
        toast.error(result.message)
        setValue(previous)
      }
    })
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{t(label)}</span>
      <select
        className="h-9 rounded-md border bg-background px-2 text-sm"
        value={value}
        disabled={isSaving}
        onChange={(e) => onChange(e.target.value)}
        data-slot-select={slot}
      >
        <option value={DEFAULT_VALUE}>{t('Default (current behavior)')}</option>
        {all.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted-foreground">{t(hint)}</span>
    </label>
  )
}

/** Per-step model slots (Phase 4c) and Opus escalation for the draft (Phase 4g). */
export function ModelSlotsForm({ models, escalation }: Props) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(escalation?.enabled ?? false)
  const [model, setModel] = useState(escalation?.model || OPUS)
  const [minTotalUsd, setMinTotalUsd] = useState(escalation?.minTotalUsd?.toString() ?? '')
  const [minSections, setMinSections] = useState(escalation?.minSections?.toString() ?? '')
  const [onLow, setOnLow] = useState(escalation?.onLowScopeConfidence ?? false)
  const [isSaving, startTransition] = useTransition()

  function saveEscalation() {
    startTransition(async () => {
      const result = await setEscalationConfig({
        enabled,
        model,
        minTotalUsd: minTotalUsd ? Number(minTotalUsd) : null,
        minSections: minSections ? Number(minSections) : null,
        onLowScopeConfidence: onLow,
      })
      if (result.ok) toast.success(result.message ?? t('Saved'))
      else toast.error(result.message)
    })
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4 space-y-4">
        <div>
          <h3 className="font-medium text-sm">{t('Model per step')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(
              'Optional. Leave a step on Default to keep today’s model. Changes apply within about 30 seconds.'
            )}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {SLOTS.map((s) => (
            <SlotSelect key={s.slot} {...s} current={models[s.slot] ?? DEFAULT_VALUE} />
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div>
          <h3 className="font-medium text-sm">{t('Opus escalation for large jobs')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(
              'Off by default. When on, the estimate draft uses the Opus model below if the two-step plan has enough sections or low scope confidence, if the project target budget is high, or (without a plan) if the transcripts and prompts are very long.'
            )}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t('Enable escalation')}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            {t('Opus model')}
            <input
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('Min sections in plan')}
            <input
              className="h-9 rounded-md border bg-background px-2 text-sm"
              inputMode="numeric"
              value={minSections}
              onChange={(e) => setMinSections(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('Min target budget (USD)')}
            <input
              className="h-9 rounded-md border bg-background px-2 text-sm"
              inputMode="decimal"
              value={minTotalUsd}
              onChange={(e) => setMinTotalUsd(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm self-end pb-2">
            <input type="checkbox" checked={onLow} onChange={(e) => setOnLow(e.target.checked)} />
            {t('Escalate on low scope confidence')}
          </label>
        </div>
        <button
          type="button"
          className="h-9 rounded-md border px-3 text-sm disabled:opacity-50"
          disabled={isSaving}
          onClick={saveEscalation}
        >
          {t('Save escalation')}
        </button>
      </div>
    </div>
  )
}
