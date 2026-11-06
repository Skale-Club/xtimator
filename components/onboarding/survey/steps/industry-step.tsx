'use client'

import { IndustryOptions } from '@/components/onboarding/industry-options'
import { Checkbox } from '@/components/ui/checkbox'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  onNext: () => void
}

export function IndustryStep({ values, setValue }: Props) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <IndustryOptions
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
            {t('Start with suggested prices.')}
          </span>{' '}
          <span className="text-muted-foreground">
            {t('US reference prices.')}
          </span>
        </span>
      </label>
    </div>
  )
}
