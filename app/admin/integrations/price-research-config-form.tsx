'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { SettingsSaveBar } from '@/components/settings/settings-ui'
import { FIELD_BASE } from '@/components/ui/field-styles'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'
import { setPriceResearchSource } from './actions'

type ResearchSource = 'openrouter_web'
type ResearchEngine = 'exa' | 'native'

type Props = {
  current: { enabled: boolean; source: ResearchSource; engine: ResearchEngine }
}

export function PriceResearchConfigForm({ current }: Props) {
  const [enabled, setEnabled] = useState(current.enabled)
  const [source, setSource] = useState<ResearchSource>(current.source)
  const [engine, setEngine] = useState<ResearchEngine>(current.engine)
  const [saved, setSaved] = useState(current)
  const [isPending, startTransition] = useTransition()
  const dirty = enabled !== saved.enabled || source !== saved.source || engine !== saved.engine
  const { t } = useTranslation()

  function handleSave() {
    startTransition(async () => {
      const res = await setPriceResearchSource({ enabled, source, engine })
      if (res.ok) {
        setSaved({ enabled, source, engine })
        toast.success(res.message ?? t('Saved'))
      } else {
        toast.error(res.message)
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold">{t('Price Research')}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            'Enable researched regional pricing and choose the search source and engine. Takes effect within 60 seconds | no redeploy.'
          )}
        </p>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={isPending}
          className="accent-primary"
        />
        <span className="text-sm">{t('Enable price research')}</span>
      </label>

      <div className="grid gap-2 max-w-sm">
        <label htmlFor="pr-source" className="text-sm font-medium">
          {t('Source')}
        </label>
        <select
          id="pr-source"
          value={source}
          onChange={(e) => setSource(e.target.value as ResearchSource)}
          disabled={isPending}
          className={cn(FIELD_BASE, 'h-10 rounded-[var(--radius-md)] px-3 text-sm')}
        >
          <option value="openrouter_web">{t('OpenRouter web')}</option>
        </select>
      </div>

      <div className="grid gap-2 max-w-sm">
        <label htmlFor="pr-engine" className="text-sm font-medium">
          {t('Engine')}
        </label>
        <select
          id="pr-engine"
          value={engine}
          onChange={(e) => setEngine(e.target.value as ResearchEngine)}
          disabled={isPending}
          className={cn(FIELD_BASE, 'h-10 rounded-[var(--radius-md)] px-3 text-sm')}
        >
          <option value="exa">{t('Exa (default)')}</option>
          <option value="native">{t('Native')}</option>
        </select>
      </div>

      <SettingsSaveBar
        dirty={dirty}
        pending={isPending}
        onDiscard={() => {
          setEnabled(saved.enabled)
          setSource(saved.source)
          setEngine(saved.engine)
        }}
        onSave={handleSave}
        saveLabel={t('Save')}
      />
    </div>
  )
}
