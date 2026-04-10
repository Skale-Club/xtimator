'use client'

import { Check, Loader2, Circle } from 'lucide-react'

const STEPS = [
  'Analyzing photos...',
  'Generating estimate...',
  'Saving...',
  'Done!',
]

interface GenerationProgressProps {
  currentStep: number
}

export function GenerationProgress({ currentStep }: GenerationProgressProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <h3 className="text-lg font-semibold mb-8">Generating Your Estimate</h3>
      <div className="space-y-4 w-full max-w-xs">
        {STEPS.map((label, idx) => {
          const isComplete = idx < currentStep
          const isActive = idx === currentStep
          const isPending = idx > currentStep

          return (
            <div key={label} className="flex items-center gap-3">
              <div className="flex-shrink-0">
                {isComplete && (
                  <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                {isActive && (
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                )}
                {isPending && (
                  <Circle className="h-6 w-6 text-muted-foreground/40" />
                )}
              </div>
              <span
                className={
                  isComplete
                    ? 'text-sm text-muted-foreground line-through'
                    : isActive
                      ? 'text-sm font-medium'
                      : 'text-sm text-muted-foreground'
                }
              >
                {label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
