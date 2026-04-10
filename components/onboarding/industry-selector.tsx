'use client'

import { INDUSTRIES } from '@/lib/industries'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  SprayCan,
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
  value: string
  customValue: string
  onChange: (id: string) => void
  onCustomChange: (value: string) => void
}

export function IndustrySelector({
  value,
  customValue,
  onChange,
  onCustomChange,
}: IndustrySelectorProps) {
  const isOtherSelected = value === 'other'

  function handleSelect(id: string) {
    onChange(id)
    if (id !== 'other') {
      onCustomChange('')
    }
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Select your industry" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {INDUSTRIES.map((industry) => {
          const Icon = ICON_MAP[industry.icon]
          const isSelected = value === industry.id

          return (
            <button
              key={industry.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleSelect(industry.id)}
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
          role="radio"
          aria-checked={isOtherSelected}
          onClick={() => handleSelect('other')}
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
          placeholder="Enter your industry"
          className="min-h-[44px] mt-3"
          value={customValue}
          onChange={(e) => onCustomChange(e.target.value)}
          autoFocus
        />
      )}
    </div>
  )
}
