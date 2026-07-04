'use client'

import type { ReactNode } from 'react'
import { HexColorPicker, HexColorInput } from 'react-colorful'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

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
}

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
}: ColorPickerPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {children ?? (
          <button
            type="button"
            aria-label="Pick color"
            className="h-10 w-10 cursor-pointer rounded border border-border"
            style={{ backgroundColor: value }}
          />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align={align}>
        <div className={PICKER_OVERRIDES}>
          <HexColorPicker color={value} onChange={onChange} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div
            className="h-6 w-6 shrink-0 rounded border border-border"
            style={{ backgroundColor: value }}
          />
          {hexInput ? (
            <HexColorInput
              prefixed
              color={value}
              onChange={onChange}
              aria-label="Hex color value"
              className="w-24 rounded border border-border bg-transparent px-2 py-1 font-mono text-xs uppercase text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          ) : (
            <span className="font-mono text-xs text-muted-foreground">{value}</span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
