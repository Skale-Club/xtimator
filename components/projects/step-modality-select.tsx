'use client'

import type { UseFormReturn } from 'react-hook-form'
import { Mic, FileText, Camera, Check, Loader2 } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'

import type { ProjectFormValues } from '@/lib/schemas/project'
import type { InputMode } from '@/lib/schemas/project'

import { cn } from '@/lib/utils'

interface StepModalitySelectProps {
  /** When provided, selection is tracked via form state. Omit for standalone picker use. */
  form?: UseFormReturn<ProjectFormValues>
  /** Called immediately on card click. */
  onSelect?: (mode: InputMode) => void
  /** True while a selection is being processed (e.g. project creation in flight). */
  isPending?: boolean
  /** Which modality is currently being processed (shown with a spinner). */
  pendingMode?: InputMode
}

type Modality = {
  value: InputMode
  label: string
  description: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

export const MODALITIES: ReadonlyArray<Modality> = [
  {
    value: 'audio',
    label: 'Record Audio',
    description: 'Voice walkthrough',
    icon: Mic,
  },
  {
    value: 'text',
    label: 'Describe',
    description: 'Type a description',
    icon: FileText,
  },
  {
    value: 'photos',
    label: 'Photos',
    description: 'Upload site photos',
    icon: Camera,
  },
] as const

export function StepModalitySelect({ form, onSelect, isPending, pendingMode }: StepModalitySelectProps) {
  const selectedMode = form?.watch('inputMode')

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {MODALITIES.map(({ value, label, description, icon: Icon }) => {
          const isSelected = selectedMode === value
          const isLoading = isPending && pendingMode === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => {
                if (onSelect) onSelect(value)
                else form?.setValue('inputMode', value, { shouldValidate: true })
              }}
              aria-pressed={isSelected}
              aria-busy={isLoading}
              disabled={isPending}
              className={cn(
                'group relative isolate overflow-hidden',
                'flex flex-row sm:flex-col items-center justify-start sm:justify-center text-left sm:text-center',
                'gap-3 sm:gap-4 px-4 py-3 sm:p-6 sm:min-h-[170px]',
                'rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]',
                'cursor-pointer transition-all duration-300 ease-out',
                'motion-safe:hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'disabled:cursor-not-allowed',
                isPending && !isLoading && 'opacity-50',
                isSelected && 'border-transparent shadow-lg shadow-primary/20'
              )}
            >
              {/* Gradient border ring (selected) */}
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-0 rounded-2xl p-[1.5px] transition-opacity duration-300',
                  'before:absolute before:inset-0 before:rounded-2xl before:gradient-brand',
                  '[mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] [mask-composite:exclude]',
                  isSelected ? 'opacity-100' : 'opacity-0'
                )}
              />

              {/* Soft inner radial glow (selected) */}
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300',
                  'bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_70%)]',
                  isSelected ? 'opacity-100' : 'opacity-0'
                )}
              />

              {/* Status badge (top-right): check when selected, spinner while pending — desktop only */}
              <span
                aria-hidden
                className={cn(
                  'hidden sm:flex absolute top-3 right-3 h-6 w-6 items-center justify-center rounded-full',
                  'gradient-brand text-white shadow-md shadow-primary/30',
                  'transition-all duration-300',
                  isSelected || isLoading ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={3} />
                ) : (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                )}
              </span>

              {/* Icon container */}
              <span
                className={cn(
                  'relative z-10 shrink-0 flex items-center justify-center rounded-xl transition-all duration-300',
                  'h-10 w-10 sm:h-14 sm:w-14',
                  isSelected
                    ? 'gradient-brand text-white shadow-lg shadow-primary/40 sm:scale-105'
                    : 'bg-muted/40 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                )}
              >
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
              </span>

              {/* Text */}
              <span className="relative z-10 min-w-0 flex-1 sm:flex-none flex flex-col gap-0.5 sm:gap-1">
                <span className="font-semibold text-sm sm:text-base leading-tight text-foreground">
                  {label}
                </span>
                <span className="text-xs sm:text-sm text-muted-foreground leading-snug">
                  {description}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {form?.formState.errors.inputMode?.message && (
        <p className="text-sm text-destructive mt-3">
          {form.formState.errors.inputMode.message}
        </p>
      )}
    </div>
  )
}
