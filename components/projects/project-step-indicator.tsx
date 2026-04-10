'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEP_TITLES = [
  'Select Client',
  'Project Details',
  'Confirm',
] as const

interface ProjectStepIndicatorProps {
  currentStep: number
  onStepClick: (step: number) => void
}

export function ProjectStepIndicator({ currentStep, onStepClick }: ProjectStepIndicatorProps) {
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
                'flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors',
                isActive && 'bg-primary text-primary-foreground',
                isCompleted && 'bg-primary text-primary-foreground',
                !isActive && !isCompleted && 'border border-border text-muted-foreground'
              )}
            >
              {isCompleted ? (
                <Check className="h-4 w-4" />
              ) : (
                step
              )}
            </button>

            {/* Step label */}
            <span
              className={cn(
                'ml-2 hidden text-sm sm:inline',
                isActive && 'font-medium text-foreground',
                isCompleted && 'text-foreground',
                !isActive && !isCompleted && 'text-muted-foreground'
              )}
            >
              {title}
            </span>

            {/* Connecting line (not after last step) */}
            {step < 3 && (
              <div
                className={cn(
                  'mx-2 h-px flex-1',
                  step < currentStep ? 'bg-primary' : 'bg-border'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
