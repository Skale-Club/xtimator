'use client'

import { PhoneInput } from '@/components/ui/phone-input'
import { Label } from '@/components/ui/label'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  onNext: () => void
}

export function PhoneStep({ values, setValue, onNext }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="survey-phone" className="sr-only">
        Phone
      </Label>
      <PhoneInput
        id="survey-phone"
        value={values.phone}
        onChange={(formatted) => setValue('phone', formatted)}
        onEnter={onNext}
        placeholder="(555) 123-4567"
        autoFocus
      />
    </div>
  )
}
