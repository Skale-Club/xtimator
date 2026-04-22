'use client'

import { IndustrySelector } from '@/components/onboarding/industry-selector'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  onNext: () => void
}

export function IndustryStep({ values, setValue }: Props) {
  return (
    <IndustrySelector
      value={values.industry}
      customValue={values.customIndustry}
      onChange={(id) => setValue('industry', id)}
      onCustomChange={(v) => setValue('customIndustry', v)}
    />
  )
}
