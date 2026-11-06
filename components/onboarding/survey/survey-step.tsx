import type { ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n/use-translation'

interface SurveyStepProps {
  label: string
  helper?: string
  error: string | null
  children: ReactNode
  centered?: boolean
}

export function SurveyStep({ label, helper, error, children, centered = false }: SurveyStepProps) {
  const { t } = useTranslation()
  return (
    <div className={`flex flex-col gap-4${centered ? ' text-center' : ''}`}>
      <div className="flex flex-col gap-1">
        <h1
          tabIndex={-1}
          aria-live="polite"
          className="text-2xl font-semibold leading-tight outline-none md:text-3xl"
        >
          {t(label)}
        </h1>
        {helper ? (
          <p className="text-sm text-muted-foreground">{t(helper)}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">{children}</div>

      {error ? (
        <p
          role="alert"
          className="text-sm text-destructive"
          data-slot="survey-error"
        >
          {t(error)}
        </p>
      ) : null}
    </div>
  )
}
