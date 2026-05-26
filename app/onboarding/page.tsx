import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getBranding } from '@/lib/platform-config'
import { OnboardingSurvey } from '@/components/onboarding/onboarding-survey'

/**
 * Phase 81 — SWITCH-11: read `?mode=add` and thread it to the survey so the
 * "add additional company" flow is reachable from the company switcher.
 *
 * Next.js 16: `searchParams` is a Promise — must be awaited before destructure.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims ?? null

  if (!claims) {
    redirect('/?auth=login')
  }

  const branding = await getBranding()
  const { mode } = await searchParams
  const addMode: 'first' | 'add' = mode === 'add' ? 'add' : 'first'

  return (
    <OnboardingSurvey
      appName={branding.appName}
      logoUrl={branding.logoUrl}
      mode={addMode}
    />
  )
}
