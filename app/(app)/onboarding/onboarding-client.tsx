'use client'

import { OnboardingSurvey } from '@/components/onboarding/onboarding-survey'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

export function OnboardingClient({
  initialValues,
}: {
  initialValues?: Partial<OnboardingValues>
}) {
  // Survey-style onboarding (Phase 70+). Prefilled from account-creation step two.
  return <OnboardingSurvey initialValues={initialValues} />
}
