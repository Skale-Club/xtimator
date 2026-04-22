'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  onNext: () => void
}

export function OwnerNameStep({ values, setValue, onNext }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="survey-owner-name" className="sr-only">
        Owner Name
      </Label>
      <Input
        id="survey-owner-name"
        autoFocus
        autoComplete="name"
        placeholder="e.g. John Smith"
        className="min-h-[44px]"
        value={values.ownerName}
        onChange={(e) => setValue('ownerName', e.target.value)}
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
