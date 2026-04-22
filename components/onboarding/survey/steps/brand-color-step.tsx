'use client'

import { ColorPicker } from '@/components/onboarding/color-picker'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  onNext: () => void
}

export function BrandColorStep({ values, setValue }: Props) {
  return (
    <ColorPicker
      value={values.brandPrimaryColor}
      onChange={(c) => setValue('brandPrimaryColor', c)}
    />
  )
}
