'use client'

import { PhoneInput } from '@/components/ui/phone-input'
import { Label } from '@/components/ui/label'
import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { useTranslation } from '@/lib/i18n/use-translation'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  onNext: () => void
}

export function PhoneStep({ values, setValue, onNext }: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="survey-phone" className="sr-only">
        {t('Phone')}
      </Label>
      <PhoneInput
        id="survey-phone"
        value={values.phone}
        onChange={(formatted) => setValue('phone', formatted)}
        onEnter={onNext}
        enterKeyHint="next"
        placeholder="(555) 123-4567"
        autoFocus
        className="[&_input]:text-base"
      />
    </div>
  )
}
