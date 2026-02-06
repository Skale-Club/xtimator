'use client'

import { MainApp } from '@/components/main-app'

// TODO: Re-enable onboarding after Supabase integration
// import { useAppStore } from '@/lib/store'
// import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'

export function AppShell() {
  // Bypass onboarding for testing
  // const { onboardingComplete } = useAppStore()
  // if (!onboardingComplete) {
  //   return <OnboardingFlow />
  // }

  return <MainApp />
}
