'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { toast } from 'sonner'

const PRESET_COLORS = [
  { name: 'System primary', hex: SYSTEM_COLORS.primary },
  { name: 'System secondary', hex: SYSTEM_COLORS.secondary },
  { name: 'Indigo', hex: '#4F46E5' },
  { name: 'Purple', hex: '#7C3AED' },
  { name: 'Rose', hex: '#E11D48' },
  { name: 'Orange', hex: '#EA580C' },
  { name: 'Amber', hex: '#D97706' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Slate', hex: '#475569' },
  { name: 'Zinc', hex: '#3F3F46' },
] as const

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [showCustom, setShowCustom] = useState(false)
  const [customHex, setCustomHex] = useState('')

  const isPreset = PRESET_COLORS.some((c) => c.hex === value)

  function handlePresetClick(hex: string) {
    setShowCustom(false)
    onChange(hex)
  }

  function handleCustomToggle() {
    setShowCustom(!showCustom)
  }

  function handleCustomBlur() {
    const hex = customHex.startsWith('#') ? customHex : `#${customHex}`
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onChange(hex)
    } else if (customHex.trim() !== '') {
      toast.error(`Invalid color code. Please enter a 6-digit hex value like ${SYSTEM_COLORS.primary}.`)
    }
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Brand color" className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((color) => (
          <button
            key={color.hex}
            type="button"
            role="radio"
            aria-checked={value === color.hex}
            aria-label={color.name}
            onClick={() => handlePresetClick(color.hex)}
            className={cn(
              'h-8 w-8 rounded-full cursor-pointer transition-all',
              value === color.hex && 'ring-2 ring-primary ring-offset-2'
            )}
            style={{ backgroundColor: color.hex }}
          />
        ))}

        {/* Custom swatch */}
        <button
          type="button"
          role="radio"
          aria-checked={!isPreset && value !== SYSTEM_COLORS.primary}
          aria-label="Custom"
          onClick={handleCustomToggle}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full cursor-pointer border border-border text-xs font-bold transition-all',
            showCustom && 'ring-2 ring-primary ring-offset-2',
            !isPreset && !showCustom && value !== SYSTEM_COLORS.primary && 'ring-2 ring-primary ring-offset-2'
          )}
          style={{
            background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
          }}
        >
          <span className="sr-only">Custom color</span>
        </button>
      </div>

      {showCustom && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">#</span>
          <Input
            placeholder={SYSTEM_COLORS.primary.slice(1)}
            className="min-h-[44px] max-w-[160px]"
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            onBlur={handleCustomBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCustomBlur()
            }}
            maxLength={7}
            autoFocus
          />
          {/^#?[0-9A-Fa-f]{6}$/.test(customHex) && (
            <div
              className="h-8 w-8 rounded-full border border-border"
              style={{
                backgroundColor: customHex.startsWith('#')
                  ? customHex
                  : `#${customHex}`,
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
