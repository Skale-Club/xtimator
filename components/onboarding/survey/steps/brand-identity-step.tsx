'use client'

import { BrandColorStep } from './brand-color-step'
import { LogoStep } from './logo-step'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

interface Props {
  values: OnboardingValues
  setValue: <K extends keyof OnboardingValues>(key: K, value: OnboardingValues[K]) => void
  logoFile: File | null
  setLogoFile: (file: File | null) => void
  logoPreview: string | null
  setLogoPreview: (preview: string | null) => void
  onNext: () => void
}

export function BrandIdentityStep(props: Props) {
  const { t } = useTranslation()
  return <div className="space-y-6">
    <BrandColorStep {...props} />
    <div className="space-y-3 border-t border-border pt-5">
      <h2 className="text-sm font-medium">{t('Company logo (optional)')}</h2>
      <LogoStep {...props} />
      <p className="text-xs text-muted-foreground">{t('PNG or JPG, up to 2MB. You can add it later.')}</p>
    </div>
  </div>
}
