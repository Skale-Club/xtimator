'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  onNext: () => void
}

export function LocationStep({ values, setValue, onNext }: Props) {
  function maybeAdvance(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onNext()
    }
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 flex flex-col gap-1">
        <Label htmlFor="survey-address">Street address</Label>
        <Input
          id="survey-address"
          autoFocus
          autoComplete="street-address"
          placeholder="123 Main St"
          className="min-h-[44px]"
          value={values.address}
          onChange={(e) => setValue('address', e.target.value)}
          onKeyDown={maybeAdvance}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="survey-city">City</Label>
        <Input
          id="survey-city"
          autoComplete="address-level2"
          placeholder="Springfield"
          className="min-h-[44px]"
          value={values.city}
          onChange={(e) => setValue('city', e.target.value)}
          onKeyDown={maybeAdvance}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="survey-state">State</Label>
          <Input
            id="survey-state"
            autoComplete="address-level1"
            placeholder="IL"
            className="min-h-[44px]"
            value={values.state}
            onChange={(e) => setValue('state', e.target.value)}
            onKeyDown={maybeAdvance}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="survey-zip">ZIP</Label>
          <Input
            id="survey-zip"
            autoComplete="postal-code"
            placeholder="62704"
            className="min-h-[44px]"
            value={values.zip}
            onChange={(e) => setValue('zip', e.target.value)}
            onKeyDown={maybeAdvance}
          />
        </div>
      </div>
    </div>
  )
}
