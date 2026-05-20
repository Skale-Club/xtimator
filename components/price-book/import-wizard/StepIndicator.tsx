'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { WizardStep } from '@/lib/csv/wizard-state'

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'map', label: 'Map' },
  { id: 'preview', label: 'Preview' },
  { id: 'confirm', label: 'Confirm' },
]

export interface StepIndicatorProps {
  currentStep: WizardStep
  onStepClick?: (step: WizardStep) => void
}

export function StepIndicator({ currentStep, onStepClick }: StepIndicatorProps) {
  const { t } = useTranslation()
  const currentIdx = STEPS.findIndex((s) => s.id === currentStep)

  return (
    <div data-slot="step-indicator" className="px-1">
      {/* Mobile: collapsed label */}
      <div className="sm:hidden text-center text-xs text-muted-foreground mb-2">
        {t('Step')} {currentIdx + 1} {t('of')} 4 — {t(STEPS[currentIdx]?.label ?? '')}
      </div>

      {/* Bars row */}
      <div className="grid grid-cols-4 gap-2">
        {STEPS.map((step, idx) => {
          const state =
            idx < currentIdx ? 'completed' : idx === currentIdx ? 'current' : 'upcoming'
          const isClickable = state === 'completed' && !!onStepClick
          const barClass = cn(
            'h-1 rounded-full transition-all',
            state === 'completed' && 'gradient-brand',
            state === 'current' && 'gradient-brand shadow-glow-brand',
            state === 'upcoming' && 'bg-muted',
          )
          return (
            <div key={step.id} className="flex flex-col gap-3">
              {isClickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick?.(step.id)}
                  className={cn(barClass, 'cursor-pointer')}
                  aria-label={`${t('Go back to step')} ${idx + 1}: ${t(step.label)}`}
                />
              ) : (
                <div className={barClass} aria-disabled={state === 'upcoming'} />
              )}
              {/* Labels — hidden on mobile */}
              <div className="hidden sm:flex items-center gap-1.5">
                {state === 'completed' ? (
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full gradient-brand text-white">
                    <Check className="h-3 w-3" />
                  </span>
                ) : (
                  <span
                    className={cn(
                      'inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-medium',
                      state === 'current'
                        ? 'gradient-brand text-white'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {idx + 1}
                  </span>
                )}
                <span
                  className={cn(
                    'text-xs',
                    state === 'current'
                      ? 'text-foreground font-semibold'
                      : state === 'completed'
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground',
                  )}
                >
                  {t(step.label)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
