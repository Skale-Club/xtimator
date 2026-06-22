'use client'

import { IndustrySelector } from '@/components/onboarding/industry-selector'
import { Checkbox } from '@/components/ui/checkbox'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  onNext: () => void
}

export function IndustryStep({ values, setValue }: Props) {
  return (
    <div className="space-y-4">
      <IndustrySelector
        value={values.industries}
        customValues={values.customIndustries}
        onChange={(ids) => setValue('industries', ids)}
        onCustomChange={(customs) => setValue('customIndustries', customs)}
      />

      <label
        htmlFor="prefill-price-book"
        className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3"
      >
        <Checkbox
          id="prefill-price-book"
          checked={values.prefillPriceBook}
          onCheckedChange={(checked) => setValue('prefillPriceBook', checked === true)}
          className="mt-0.5"
        />
        <span className="text-sm">
          <span className="font-medium text-foreground">
            Pre-fill my price book with starter prices.
          </span>{' '}
          <span className="text-muted-foreground">
            We&apos;ll add common services and US average-market prices for the
            services you selected — starting points you can edit or delete anytime.
            Leave unchecked to start with an empty price book.
          </span>
        </span>
      </label>
    </div>
  )
}
