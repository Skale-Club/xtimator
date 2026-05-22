'use client'

import type { UseFormReturn } from 'react-hook-form'
import { Mic, FileText, Camera } from 'lucide-react'

import type { ProjectFormValues } from '@/lib/schemas/project'
import type { InputMode } from '@/lib/schemas/project'

import { cn } from '@/lib/utils'

interface StepModalitySelectProps {
  form: UseFormReturn<ProjectFormValues>
}

const MODALITIES = [
  {
    value: 'audio' as InputMode,
    label: 'Audio',
    description: 'Record a voice description',
    icon: Mic,
  },
  {
    value: 'text' as InputMode,
    label: 'Text',
    description: 'Type a job description',
    icon: FileText,
  },
  {
    value: 'photos' as InputMode,
    label: 'Photos',
    description: 'Upload photos',
    icon: Camera,
  },
] as const

export function StepModalitySelect({ form }: StepModalitySelectProps) {
  const selectedMode = form.watch('inputMode')

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Choose how you want to describe the job</h2>
      <p className="text-sm text-muted-foreground">
        Select the input method that works best for this project.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 pt-2">
        {MODALITIES.map(({ value, label, description, icon: Icon }) => {
          const isSelected = selectedMode === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => form.setValue('inputMode', value, { shouldValidate: true })}
              className={cn(
                'flex flex-row sm:flex-col items-center justify-start sm:justify-center gap-3 sm:gap-3 px-3 py-2.5 sm:p-6 rounded-lg border sm:border-2 transition-all cursor-pointer text-left sm:text-center',
                'hover:border-primary/50 hover:bg-primary/5',
                'sm:min-h-[160px]',
                isSelected
                  ? 'border-primary bg-primary/10 sm:ring-2 sm:ring-primary/20'
                  : 'border-muted bg-card'
              )}
            >
              <Icon
                className={cn(
                  'h-5 w-5 sm:h-10 sm:w-10 shrink-0 transition-colors',
                  isSelected ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              <div className="min-w-0 flex-1 sm:flex-none space-y-0 sm:space-y-1">
                <p className={cn('font-medium sm:font-semibold text-sm sm:text-base leading-tight', isSelected && 'text-primary')}>
                  {label}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground leading-tight truncate">{description}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Validation error */}
      {form.formState.errors.inputMode?.message && (
        <p className="text-sm text-destructive">
          {form.formState.errors.inputMode.message}
        </p>
      )}
    </div>
  )
}