'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OnboardingValues } from '@/lib/schemas/onboarding'
import { useTranslation } from '@/lib/i18n/use-translation'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(key: K, value: OnboardingValues[K]) => void
  onNext: () => void
}

export function LocationStep({ values, setValue, onNext }: Props) {
  const { t } = useTranslation()
  return <div className="space-y-2">
    <Label htmlFor="survey-region">{t('Service area')}</Label>
    <Input id="survey-region" autoFocus autoComplete="off" enterKeyHint="next" maxLength={120}
      placeholder={t('Greater Boston, Connecticut or Framingham')}
      className="min-h-11 text-base" value={values.city} onChange={event => setValue('city', event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); onNext() } }} />
  </div>
}
