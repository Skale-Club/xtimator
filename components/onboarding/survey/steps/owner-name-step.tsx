'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { useTranslation } from '@/lib/i18n/use-translation'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(k: K, v: OnboardingValues[K]) => void
  onNext: () => void
}

export function OwnerNameStep({ values, setValue, onNext }: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="survey-owner-name" className="sr-only">
        {t('Owner Name')}
      </Label>
      <Input
        id="survey-owner-name"
        autoFocus
        autoComplete="name"
        placeholder={t('e.g. John Smith')}
        enterKeyHint="next"
        className="min-h-[44px] text-base"
        value={values.ownerName}
        onChange={(e) => setValue('ownerName', e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            onNext()
          }
        }}
      />
    </div>
  )
}
