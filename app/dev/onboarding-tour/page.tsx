'use client'

import { notFound } from 'next/navigation'
import { useSurveyState } from '@/components/onboarding/survey/use-survey-state'
import { SurveyShell } from '@/components/onboarding/survey/survey-shell'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

const INITIAL: OnboardingValues = {
  companyName: '', subdomain: '', ownerName: '', phone: '', email: '', website: '',
  language: 'en', industries: [], customIndustries: [], prefillPriceBook: false,
  brandPrimaryColor: SYSTEM_COLORS.primary, address: '', city: '', state: '', zip: '',
  licenseNumber: '', insuranceInfo: '', defaultTaxRate: 0, defaultPaymentTerms: 'Net 30',
  defaultWarrantyTerms: '1 year', defaultValidityDays: 30,
}

export default function OnboardingTourPreview() {
  const scenario = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('scenario') ?? ''
  const state = useSurveyState(INITIAL, `xtimator_readonly_onboarding_screenshots${scenario ? `:${scenario}` : ''}`)
  if (process.env.NODE_ENV !== 'development') notFound()
  return <SurveyShell appName="Xtimator" logoUrl={null} state={state} isSubmitting={false} onComplete={() => {}} />
}
