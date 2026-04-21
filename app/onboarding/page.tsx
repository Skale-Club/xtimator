import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getBranding } from '@/lib/platform-config'
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims ?? null

  if (!claims) {
    redirect('/auth/login')
  }

  const branding = await getBranding()

  return <OnboardingWizard appName={branding.appName} />
}
