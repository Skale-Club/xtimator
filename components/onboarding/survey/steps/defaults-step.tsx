'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  onNext: () => void
}

export function DefaultsStep({ values, setValue, onNext }: Props) {
  function maybeAdvance(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onNext()
    }
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="survey-tax">Tax rate (%)</Label>
        <Input
          id="survey-tax"
          autoFocus
          type="number"
          min={0}
          max={100}
          step="0.01"
          className="min-h-[44px]"
          value={values.defaultTaxRate}
          onChange={(e) =>
            setValue('defaultTaxRate', Number(e.target.value) || 0)
          }
          onKeyDown={maybeAdvance}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="survey-validity">Validity (days)</Label>
        <Input
          id="survey-validity"
          type="number"
          min={1}
          className="min-h-[44px]"
          value={values.defaultValidityDays}
          onChange={(e) =>
            setValue('defaultValidityDays', Number(e.target.value) || 1)
          }
          onKeyDown={maybeAdvance}
        />
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <Label htmlFor="survey-payment">Payment terms</Label>
        <Input
          id="survey-payment"
          placeholder="Net 30"
          className="min-h-[44px]"
          value={values.defaultPaymentTerms}
          onChange={(e) => setValue('defaultPaymentTerms', e.target.value)}
          onKeyDown={maybeAdvance}
        />
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <Label htmlFor="survey-warranty">Warranty terms</Label>
        <Input
          id="survey-warranty"
          placeholder="1 year"
          className="min-h-[44px]"
          value={values.defaultWarrantyTerms}
          onChange={(e) => setValue('defaultWarrantyTerms', e.target.value)}
          onKeyDown={maybeAdvance}
        />
      </div>
    </div>
  )
}
