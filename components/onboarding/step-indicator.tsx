'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEP_TITLES = [
  'Business Information',
  'Brand Identity',
  'Address & Defaults',
] as const

interface StepIndicatorProps {
  currentStep: number
  onStepClick: (step: number) => void
}

export function StepIndicator({ currentStep, onStepClick }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      {STEP_TITLES.map((title, index) => {
        const step = index + 1
        const isActive = step === currentStep
        const isCompleted = step < currentStep

        return (
          <div key={step} className="flex flex-1 items-center">
            {/* Step circle */}
            <button
              type="button"
              onClick={() => onStepClick(step)}
              aria-label={`Step ${step} of 3: ${title}`}
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors',
                isActive && 'gradient-brand text-white shadow-glow-brand',
                isCompleted && 'gradient-brand text-white',
                !isActive && !isCompleted && 'border border-border text-muted-foreground'
              )}
            >
              {isCompleted ? (
                <Check className="h-4 w-4" />
              ) : (
                step
              )}
            </button>

            {/* Connecting line (not after last step) */}
            {step < 3 && (
              <div
                className={cn(
                  'mx-2 h-px flex-1',
                  step < currentStep ? 'gradient-brand' : 'bg-border'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
