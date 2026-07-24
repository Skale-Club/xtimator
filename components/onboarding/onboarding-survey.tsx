'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useSurveyState } from '@/components/onboarding/survey/use-survey-state'
import { SurveyShell } from '@/components/onboarding/survey/survey-shell'
import { createOrUpdateCompany, uploadOnboardingLogoAction } from '@/lib/actions/company'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

const INITIAL: OnboardingValues = {
  companyName: '',
  subdomain: '',
  ownerName: '',
  phone: '',
  email: '',
  website: '',
  language: 'en',
  industries: [],
  customIndustries: [],
  prefillPriceBook: false,
  brandPrimaryColor: SYSTEM_COLORS.primary,
  address: '',
  city: '',
  state: '',
  zip: '',
  licenseNumber: '',
  insuranceInfo: '',
  defaultTaxRate: 0,
  defaultPaymentTerms: 'Net 30',
  defaultWarrantyTerms: '1 year',
  defaultValidityDays: 30,
}

export function OnboardingSurvey({
  appName,
  logoUrl,
  mode = 'first',
  initialValues,
}: {
  appName: string
  logoUrl: string | null
  mode?: 'first' | 'add'
  initialValues?: Partial<OnboardingValues>
}) {
  const state = useSurveyState({ ...INITIAL, ...initialValues }, `xtimator_onboarding_${mode}`)
  const [isSubmitting, startTransition] = useTransition()

  function handleComplete() {
    startTransition(async () => {
      try {
        let logoUrl: string | undefined
        if (state.logoFile) {
          const fd = new FormData()
          fd.set('file', state.logoFile)
          const result = await uploadOnboardingLogoAction(fd)
          if (result.error) {
            toast.error('Logo upload failed. Continuing without a logo.')
          } else {
            logoUrl = result.data?.url
          }
        }

        const result = await createOrUpdateCompany(
          {
            ...state.values,
            logoUrl,
          },
          { mode }
        )
        if (result?.error) {
          toast.error(result.error)
        } else {
          // Wipe the draft so a future visit to /onboarding starts fresh.
          state.clearPersistedState()
        }
      } catch {
        // redirect throws NEXT_REDIRECT, which is expected
      }
    })
  }

  return (
    <SurveyShell
      appName={appName}
      logoUrl={logoUrl}
      state={state}
      isSubmitting={isSubmitting}
      onComplete={handleComplete}
    />
  )
}
