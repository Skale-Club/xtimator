import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getBranding } from '@/lib/platform-config'
import { OnboardingSurvey } from '@/components/onboarding/onboarding-survey'
import type { Metadata } from 'next'
import { PRIVATE_ROBOTS } from '@/lib/seo/route-policy'

export const metadata: Metadata = { robots: PRIVATE_ROBOTS }

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

  // Prefill company name and subdomain captured during account-creation step two.
  // They were stored on the auth user's metadata at sign up so they survive the
  // redirect here. Only used for the first company, not the "add company" flow.
  const metadata = (claims.user_metadata ?? {}) as {
    company_name?: string
    subdomain?: string
  }
  const initialValues =
    addMode === 'first'
      ? {
          ...(metadata.company_name ? { companyName: metadata.company_name } : {}),
          ...(metadata.subdomain ? { subdomain: metadata.subdomain } : {}),
        }
      : undefined

  return (
    <OnboardingSurvey
      appName={branding.appName}
      logoUrl={branding.logoUrl}
      mode={addMode}
      initialValues={initialValues}
    />
  )
}
