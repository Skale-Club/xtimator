import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getBranding } from '@/lib/platform-config'
import { OnboardingSurvey } from '@/components/onboarding/onboarding-survey'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims ?? null

  if (!claims) {
    redirect('/login')
  }

  const branding = await getBranding()

  return <OnboardingSurvey appName={branding.appName} logoUrl={branding.logoUrl} />
}
