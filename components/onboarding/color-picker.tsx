'use client'

import { useId, useState } from 'react'
import { Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { useTranslation } from '@/lib/i18n/use-translation'
import { toast } from 'sonner'

const PRESET_COLORS = [
  { name: 'System primary', hex: SYSTEM_COLORS.primary },
  { name: 'System secondary', hex: SYSTEM_COLORS.secondary },
  { name: 'Indigo', hex: '#4F46E5' }, { name: 'Purple', hex: '#7C3AED' },
  { name: 'Rose', hex: '#E11D48' }, { name: 'Orange', hex: '#EA580C' },
  { name: 'Amber', hex: '#D97706' }, { name: 'Emerald', hex: '#059669' },
  { name: 'Slate', hex: '#475569' }, { name: 'Zinc', hex: '#3F3F46' },
] as const

interface ColorPickerProps { value: string; onChange: (color: string) => void; onEnter?: () => void }
const validHex = (value: string) => /^#[0-9A-Fa-f]{6}$/.test(value)

export function ColorPicker({ value, onChange, onEnter }: ColorPickerProps) {
  const { t } = useTranslation()
  const editorId = useId()
  const [showCustom, setShowCustom] = useState(false)
  const [customHex, setCustomHex] = useState('')
  const isPreset = PRESET_COLORS.some(color => color.hex.toLowerCase() === value.toLowerCase())
  const normalizedHex = customHex.startsWith('#') ? customHex : `#${customHex}`

  function applyCustom() {
    if (validHex(normalizedHex)) { onChange(normalizedHex.toUpperCase()); return true }
    if (customHex.trim()) toast.error(t('Enter a valid 6-digit hex color.'))
    return false
  }

  return <div>
    <div role="radiogroup" aria-label={t('Brand color')} className="grid grid-cols-4 gap-2 min-[384px]:grid-cols-6"
      onKeyDown={event => {
        const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']
        if (!keys.includes(event.key)) return
        const radios = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'))
        const current = radios.indexOf(document.activeElement as HTMLButtonElement)
        if (current < 0) return
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? radios.length - 1 :
          (current + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + radios.length) % radios.length
        radios[next]?.focus(); radios[next]?.click()
      }}>
      {PRESET_COLORS.map(color => {
        const selected = value.toLowerCase() === color.hex.toLowerCase()
        return <button key={color.hex} type="button" role="radio" aria-checked={selected} aria-label={t(color.name)}
          onClick={() => { setShowCustom(false); onChange(color.hex) }}
          className={cn('relative flex h-11 w-full min-w-0 cursor-pointer items-center justify-center rounded-[4px] border border-white/10 transition-[box-shadow,transform] hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background', selected && 'ring-2 ring-foreground ring-offset-2 ring-offset-background')}
          style={{ backgroundColor: color.hex }}>
          {selected ? <Check aria-hidden className="size-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" /> : null}
        </button>
      })}
      <button type="button" role="radio" aria-checked={!isPreset} aria-label={t('Custom')} aria-controls={editorId}
        onClick={() => { setCustomHex(validHex(value) ? value.slice(1) : SYSTEM_COLORS.primary.slice(1)); setShowCustom(open => !open) }}
        className={cn('relative col-span-2 flex h-11 cursor-pointer items-center justify-center overflow-hidden rounded-[4px] border bg-background px-3 pb-1 text-xs font-semibold transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background', showCustom || !isPreset ? 'border-primary ring-2 ring-primary/60 ring-offset-2 ring-offset-background' : 'border-border')}>
        {t('Custom')}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-[linear-gradient(90deg,#f43f5e,#f59e0b,#eab308,#22c55e,#06b6d4,#6366f1,#d946ef)]" />
      </button>
    </div>
    {showCustom ? <div id={editorId} className="mt-5 space-y-2">
      <label htmlFor={`${editorId}-hex`} className="text-sm font-medium">{t('Hex color')}</label>
      <div className="flex items-center gap-3">
        <input type="color" aria-label={t('Custom color')} value={validHex(normalizedHex) ? normalizedHex : value}
          onChange={event => { setCustomHex(event.target.value.slice(1)); onChange(event.target.value.toUpperCase()) }}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-background p-1" />
        <span aria-hidden className="text-muted-foreground">#</span>
        <Input id={`${editorId}-hex`} placeholder={SYSTEM_COLORS.primary.slice(1)} className="h-11 min-w-0 flex-1 font-mono text-base" value={customHex}
          onChange={event => {
            const next = event.target.value
            setCustomHex(next)
            const hex = next.startsWith('#') ? next : `#${next}`
            if (validHex(hex)) onChange(hex.toUpperCase())
          }} onBlur={applyCustom} maxLength={7} autoFocus autoCapitalize="characters" autoComplete="off" spellCheck={false} enterKeyHint="next"
          onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); if (applyCustom()) onEnter?.() } }} />
      </div>
    </div> : null}
  </div>
}
