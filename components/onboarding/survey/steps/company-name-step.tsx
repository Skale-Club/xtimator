'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  onNext: () => void
}

export function CompanyNameStep({ values, setValue, onNext }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="survey-company-name" className="sr-only">
        Company Name
      </Label>
      <Input
        id="survey-company-name"
        autoFocus
        autoComplete="organization"
        placeholder="e.g. Smith Painting LLC"
        className="min-h-[44px]"
        value={values.companyName}
        onChange={(e) => setValue('companyName', e.target.value)}
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
