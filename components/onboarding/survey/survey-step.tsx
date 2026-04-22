import type { ReactNode } from 'react'

interface SurveyStepProps {
  label: string
  helper?: string
  error: string | null
  children: ReactNode
}

export function SurveyStep({ label, helper, error, children }: SurveyStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1
          aria-live="polite"
          className="text-2xl font-semibold leading-tight md:text-3xl"
        >
          {label}
        </h1>
        {helper ? (
          <p className="text-sm text-muted-foreground">{helper}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">{children}</div>

      {error ? (
        <p
          role="alert"
          className="text-sm text-destructive"
          data-slot="survey-error"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
