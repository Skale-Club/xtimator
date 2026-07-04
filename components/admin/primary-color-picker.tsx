'use client'

import { HexColorPicker } from 'react-colorful'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface PrimaryColorPickerProps {
  value: string
  onChange: (hex: string) => void
}

export function PrimaryColorPicker({ value, onChange }: PrimaryColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Pick primary color"
          className="h-10 w-10 cursor-pointer rounded border border-border"
          style={{ backgroundColor: value }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div
          className="[&_.react-colorful]:w-full [&_.react-colorful__saturation]:rounded-md [&_.react-colorful__hue]:rounded-md [&_.react-colorful__hue]:mt-2 [&_.react-colorful__pointer]:h-4 [&_.react-colorful__pointer]:w-4"
        >
          <HexColorPicker color={value} onChange={onChange} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div
            className="h-6 w-6 rounded border border-border"
            style={{ backgroundColor: value }}
          />
          <span className="font-mono text-xs text-muted-foreground">{value}</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
