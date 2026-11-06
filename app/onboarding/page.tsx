import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getBranding } from '@/lib/platform-config'
import { OnboardingSurvey } from '@/components/onboarding/onboarding-survey'
import type { Metadata } from 'next'
import { PRIVATE_ROBOTS } from '@/lib/seo/route-policy'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { ownedAuthEnabled } from '@/lib/auth/mode'
import { accountDefaults } from '@/lib/onboarding/draft'
import { getOrCreateOnboardingDraft } from '@/lib/queries/onboarding-draft'

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

  const { mode } = await searchParams
  const addMode: 'first' | 'add' = mode === 'add' ? 'add' : 'first'

  // SEED-055 D9: adding a company is unavailable (1 company + 1 user until
  // add-ons exist). `?mode=add` has no entry point anymore; a hand-typed URL
  // goes back to the app instead of an onboarding form whose submit is refused.
  if (addMode === 'add') {
    redirect('/dashboard')
  }

  // D-13/D-14 guard: a user who already has an active company landing on the
  // plain onboarding URL (no `?mode=add`) has nothing to onboard — send them
  // to the dashboard instead of re-running 'first'-mode onboarding, which used
  // to be exploitable for repeat signup credit grants (see the
  // createOrUpdateCompany guard in lib/actions/company.ts). The deliberate
  // `?mode=add` add-company flow (Phase 80, launched from the company
  // selector) must stay reachable regardless of this check.
  if (addMode === 'first') {
    const activeCompanyId = await getActiveCompanyId()
    if (activeCompanyId) {
      redirect('/dashboard')
    }
  }
  // Google identity exchange requires SMS before issuing a new owned session.
  // Also block an older phone-less session from bypassing that requirement.
  if (ownedAuthEnabled() && !claims.phone) redirect('/?auth=login')
  const [branding, draft] = await Promise.all([getBranding(), getOrCreateOnboardingDraft(addMode)])

  // Prefill company name and subdomain captured during account-creation step two.
  // They were stored on the auth user's metadata at sign up so they survive the
  // redirect here. Only used for the first company, not the "add company" flow.
  const metadata = (claims.user_metadata ?? {}) as {
    company_name?: string
    subdomain?: string
  }
  const initialValues = {
    ...accountDefaults(claims),
    ...(addMode === 'first'
      ? {
          ...(metadata.company_name ? { companyName: metadata.company_name } : {}),
          ...(metadata.subdomain ? { subdomain: metadata.subdomain } : {}),
        }
      : {}),
  }

  return (
    <OnboardingSurvey
      appName={branding.appName}
      logoUrl={branding.logoUrl}
      mode={addMode}
      initialValues={initialValues}
      draft={draft}
    />
  )
}
