'use client'

import { Input } from '@/components/ui/input'
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
      <Input
        id="survey-phone"
        type="tel"
        autoFocus
        autoComplete="tel"
        placeholder="(555) 123-4567"
        className="min-h-[44px]"
        value={values.phone}
        onChange={(e) => setValue('phone', e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onNext()
          }
        }}
      />
    </div>
  )
}
