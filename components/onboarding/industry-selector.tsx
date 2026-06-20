'use client'

import { INDUSTRIES, OTHER_INDUSTRY_ID } from '@/lib/industries'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  SprayCan,
  Sofa,
  Droplets,
  Paintbrush,
  TreePine,
  Zap,
  Wrench,
  Hammer,
  Home,
  Fan,
  MoreHorizontal,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  SprayCan,
  Sofa,
  Droplets,
  Paintbrush,
  TreePine,
  Zap,
  Wrench,
  Hammer,
  Home,
  Fan,
  MoreHorizontal,
}

interface IndustrySelectorProps {
  /** Selected card ids (predefined industry ids, may include the 'other' sentinel). */
  value: string[]
  customValue: string
  onChange: (ids: string[]) => void
  onCustomChange: (value: string) => void
}

export function IndustrySelector({
  value,
  customValue,
  onChange,
  onCustomChange,
}: IndustrySelectorProps) {
  const isOtherSelected = value.includes(OTHER_INDUSTRY_ID)

  function toggle(id: string) {
    const next = value.includes(id)
      ? value.filter((v) => v !== id)
      : [...value, id]
    onChange(next)
    if (id === OTHER_INDUSTRY_ID && value.includes(OTHER_INDUSTRY_ID)) {
      // 'other' was just toggled OFF — clear its free text.
      onCustomChange('')
    }
  }

  return (
    <div>
      <div role="group" aria-label="Select your services" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {INDUSTRIES.map((industry) => {
          const Icon = ICON_MAP[industry.icon]
          const isSelected = value.includes(industry.id)

          return (
            <button
              key={industry.id}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              onClick={() => toggle(industry.id)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors cursor-pointer',
                isSelected
                  ? 'border-primary border-2 bg-primary/5'
                  : 'border-border bg-card hover:bg-accent/50'
              )}
            >
              {Icon && <Icon className="h-6 w-6" />}
              <span className="text-sm">{industry.label}</span>
            </button>
          )
        })}

        {/* Other card */}
        <button
          type="button"
          role="checkbox"
          aria-checked={isOtherSelected}
          onClick={() => toggle(OTHER_INDUSTRY_ID)}
          className={cn(
            'flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors cursor-pointer',
            isOtherSelected
              ? 'border-primary border-2 bg-primary/5'
              : 'border-border bg-card hover:bg-accent/50'
          )}
        >
          <MoreHorizontal className="h-6 w-6" />
          <span className="text-sm">Other</span>
        </button>
      </div>

      {isOtherSelected && (
        <Input
          placeholder="Enter your service"
          className="min-h-[44px] mt-3"
          value={customValue}
          onChange={(e) => onCustomChange(e.target.value)}
          autoFocus
        />
      )}
    </div>
  )
}
