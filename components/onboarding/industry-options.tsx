'use client'

import { useId, useState } from 'react'
import { Check, ChevronDown, Plus, SprayCan, Sofa, Droplets, Paintbrush, TreePine, Zap, Wrench, Hammer, Home, Fan, HousePlus, HardHat, Ruler } from 'lucide-react'
import { INDUSTRIES } from '@/lib/industries'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const ICONS: Record<string, typeof Check> = { SprayCan, Sofa, Droplets, Paintbrush, TreePine, Zap, Wrench, Hammer, Home, Fan, HousePlus, HardHat, Ruler }

export const SERVICE_GROUPS = [
  { id: 'cleaning', label: 'Cleaning', icon: SprayCan, services: ['house_cleaning', 'upholstery_carpet_cleaning', 'window_cleaning'] },
  { id: 'construction', label: 'Construction & Remodeling', icon: HardHat, services: ['general_contracting', 'remodeling', 'painting', 'home_improvement', 'roofing'] },
  { id: 'trades', label: 'Installations & Maintenance', icon: Wrench, services: ['electrical', 'plumbing', 'hvac', 'handyman'] },
  { id: 'outdoor', label: 'Outdoor Services', icon: TreePine, services: ['landscaping'] },
] as const

interface Props {
  value: string[]
  customValues: string[]
  onChange: (ids: string[]) => void
  onCustomChange: (labels: string[]) => void
}

export function IndustryOptions({ value, customValues, onChange, onCustomChange }: Props) {
  const { t } = useTranslation()
  const groupId = useId()
  const [custom, setCustom] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [activeGroup, setActiveGroup] = useState<string>(() => SERVICE_GROUPS.find(group => group.services.some(id => value.includes(id)))?.id ?? 'cleaning')
  function addCustom() {
    const label = custom.trim()
    if (!label) return
    const known = INDUSTRIES.find(option => [option.label, t(option.label)].some(name => name.toLocaleLowerCase() === label.toLocaleLowerCase()))
    if (known) {
      if (!value.includes(known.id)) onChange([...value, known.id])
      const group = SERVICE_GROUPS.find(group => group.services.some(id => id === known.id))
      if (group) setActiveGroup(group.id)
    } else if (!customValues.some(name => name.toLocaleLowerCase() === label.toLocaleLowerCase())) {
      onCustomChange([...customValues, label])
    }
    setCustom('')
  }
  return <div className="space-y-4">
    <div aria-label={t('Service groups')} className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/40">
        {SERVICE_GROUPS.map(group => {
          const count = group.services.filter(id => value.includes(id)).length
          const open = activeGroup === group.id
          const GroupIcon = group.icon
          return <div key={group.id}>
            <h2>
              <button id={`${groupId}-${group.id}-trigger`} type="button" aria-expanded={open} aria-controls={`${groupId}-${group.id}-content`}
                onClick={() => setActiveGroup(open ? '' : group.id)} className="flex min-h-12 w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><GroupIcon className="size-4" /></span>
                <span className="min-w-0 flex-1 text-sm font-medium">{t(group.label)}</span>
                {count ? <span className="text-xs tabular-nums text-muted-foreground">{count}</span> : null}
                <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
              </button>
            </h2>
            {open ? <div id={`${groupId}-${group.id}-content`} role="region" aria-labelledby={`${groupId}-${group.id}-trigger`} className="divide-y divide-border/40 border-t border-border/50 bg-muted/10">
      {INDUSTRIES.filter(industry => group.services.some(id => id === industry.id)).map(industry => {
        const Icon = ICONS[industry.icon]
        const selected = value.includes(industry.id)
        return <button key={industry.id} type="button" role="checkbox" aria-checked={selected}
          onClick={() => onChange(selected ? value.filter(id => id !== industry.id) : [...value, industry.id])}
          className={cn('flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left text-sm leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', selected ? 'bg-primary/5 text-foreground' : 'text-muted-foreground hover:bg-muted/30')}>
          {Icon ? <Icon aria-hidden className={cn('size-4 shrink-0', selected && 'text-primary')} /> : null}
          <span className="min-w-0 flex-1 break-words">{t(industry.label)}</span>
          <span aria-hidden className="size-4 shrink-0 text-primary">
            {selected ? <Check className="size-4" /> : null}
          </span>
        </button>
      })}
            </div> : null}
          </div>
        })}
    </div>
    <p role="status" className="sr-only">{t('Selected services')}: {value.length + customValues.length}</p>
    {customValues.length ? <div className="grid grid-cols-2 gap-2.5">
      {customValues.map(label => <button key={label} type="button" role="checkbox" aria-checked="true" onClick={() => onCustomChange(customValues.filter(name => name !== label))}
        className="flex min-h-16 items-center gap-2 rounded-xl border border-primary bg-primary/10 px-3 py-3 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0 flex-1 break-words font-medium">{label}</span><Check aria-hidden className="size-4 shrink-0 text-primary" />
      </button>)}
    </div> : null}
    <div className="space-y-2">
      <button type="button" aria-expanded={showCustom} aria-controls="survey-custom-service-editor" onClick={() => setShowCustom(open => !open)} className="flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline">
        <Plus aria-hidden className="size-4" />{t('Another service')}
      </button>
      {showCustom ? <div id="survey-custom-service-editor" className="flex gap-2">
        <Input id="survey-custom-service" value={custom} onChange={event => setCustom(event.target.value)} maxLength={80}
          aria-label={t('Another service')} autoFocus
          placeholder={t('Describe another service')} className="h-11 min-w-0 flex-1 text-base" enterKeyHint="done"
          onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); addCustom() } }} />
        <Button type="button" variant="outline" size="icon" aria-label={t('Add service')} disabled={!custom.trim()} onClick={addCustom} className="size-11 shrink-0"><Plus aria-hidden className="size-4" /></Button>
      </div> : null}
    </div>
  </div>
}
