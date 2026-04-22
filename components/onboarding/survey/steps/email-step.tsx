'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  onNext: () => void
}

export function EmailStep({ values, setValue, onNext }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="survey-email" className="sr-only">
        Email
      </Label>
      <Input
        id="survey-email"
        type="email"
        autoFocus
        autoComplete="email"
        placeholder="john@smithpainting.com"
        className="min-h-[44px]"
        value={values.email}
        onChange={(e) => setValue('email', e.target.value)}
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
