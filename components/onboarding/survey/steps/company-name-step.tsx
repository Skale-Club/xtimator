'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { useTranslation } from '@/lib/i18n/use-translation'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  onNext: () => void
}

export function CompanyNameStep({ values, setValue, onNext }: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="survey-company-name" className="sr-only">
        {t('Company Name')}
      </Label>
      <Input
        id="survey-company-name"
        autoFocus
        autoComplete="organization"
        maxLength={160}
        placeholder={t('e.g. Smith Painting LLC')}
        enterKeyHint="next"
        className="min-h-[44px] text-base"
        value={values.companyName}
        onChange={(e) => setValue('companyName', e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            onNext()
          }
        }}
      />
    </div>
  )
}
