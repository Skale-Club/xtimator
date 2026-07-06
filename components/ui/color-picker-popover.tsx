'use client'

import { useState, type ReactNode } from 'react'
import { HexColorPicker, HexColorInput } from 'react-colorful'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useTranslation } from '@/lib/i18n/use-translation'

interface ColorPickerPopoverProps {
  value: string
  onChange: (hex: string) => void
  /**
   * Custom trigger element. Falls back to a 40px swatch button when omitted.
   * Passed straight to PopoverTrigger asChild, so it must be a single element
   * that accepts a ref and props (e.g. a <button>).
   */
  children?: ReactNode
  /** Popover alignment relative to the trigger. Defaults to "start". */
  align?: 'start' | 'center' | 'end'
  /**
   * When true, the footer shows an editable hex field (react-colorful's
   * HexColorInput) so an exact value can be typed. When false (default) it
   * shows the current hex as read-only text — use this when an external hex
   * input already lives next to the trigger.
   */
  hexInput?: boolean
  /** Preset swatches shown below the gradient. Pass [] to hide them. */
  presets?: string[]
}

// Curated brand-friendly palette. First entry mirrors the system primary.
const DEFAULT_PRESETS = [
  '#406EF1', // System blue
  '#0D9488', // Teal
  '#4F46E5', // Indigo
  '#7C3AED', // Purple
  '#E11D48', // Rose
  '#EA580C', // Orange
  '#D97706', // Amber
  '#059669', // Emerald
  '#475569', // Slate
  '#3F3F46', // Zinc
]

// react-colorful injects its own un-layered CSS on import; Tailwind v4 utilities
// live in @layer utilities and lose the cascade to it regardless of specificity,
// so these overrides need the `!` important modifier. The `\_\_` escapes are
// required too — Tailwind treats a bare `_` in an arbitrary value as a space,
// which would break react-colorful's BEM `__` class names.
const PICKER_OVERRIDES =
  '[&_.react-colorful\\_\\_saturation]:rounded-md! ' +
  '[&_.react-colorful\\_\\_hue]:rounded-md! ' +
  '[&_.react-colorful\\_\\_hue]:mt-2! ' +
  '[&_.react-colorful\\_\\_pointer]:h-4! ' +
  '[&_.react-colorful\\_\\_pointer]:w-4!'

export function ColorPickerPopover({
  value,
  onChange,
  children,
  align = 'start',
  hexInput = false,
  presets = DEFAULT_PRESETS,
}: ColorPickerPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <button
            type="button"
            aria-label={t('Pick color')}
            className="h-10 w-10 cursor-pointer rounded border border-border"
            style={{ backgroundColor: value }}
          />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align={align}>
        <div className={PICKER_OVERRIDES}>
          <HexColorPicker color={value} onChange={onChange} />
        </div>

        {presets.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {presets.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={hex}
                title={hex}
                onClick={() => onChange(hex)}
                className={cn(
                  'h-5 w-5 rounded-full border border-border/50 transition-transform hover:scale-110',
                  value.toLowerCase() === hex.toLowerCase() &&
                    'ring-2 ring-ring ring-offset-1 ring-offset-popover'
                )}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        )}

        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <div
              className="h-6 w-6 shrink-0 rounded border border-border"
              style={{ backgroundColor: value }}
            />
            {hexInput ? (
              <HexColorInput
                prefixed
                color={value}
                onChange={onChange}
                aria-label={t('Hex color value')}
                className="w-24 rounded border border-border bg-transparent px-2 py-1 font-mono text-xs uppercase text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            ) : (
              <span className="font-mono text-xs text-muted-foreground">{value}</span>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={() => setOpen(false)}
          >
            {t('Save color')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
