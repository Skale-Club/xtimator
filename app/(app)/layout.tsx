import { redirect } from 'next/navigation'
import { getCachedBranding } from '@/lib/platform-config'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { requireServiceClient } from '@/lib/supabase/service'
import { Sidebar } from '@/components/app-shell/sidebar'
import { Topbar } from '@/components/app-shell/topbar'
import { BottomNav } from '@/components/app-shell/bottom-nav'
import { MobileHeader } from '@/components/app-shell/mobile-header'
import { TranslationLoadingOverlay } from '@/components/i18n/translation-loading-overlay'
import { TrialBanner } from '@/components/billing/trial-banner'
import { UpgradeModal } from '@/components/billing/upgrade-modal'
import { TourProvider } from '@/components/tour/tour-provider'
import { WelcomeModal } from '@/components/tour/welcome-modal'
import { TourSpotlight } from '@/components/tour/tour-spotlight'
import { TourHelpButton } from '@/components/tour/tour-help-button'

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const claims = await getAuthClaims()

  if (!claims) {
    redirect('/login')
  }

  // Start branding immediately — no dependency on company (D-06, D-09)
  const brandingPromise = getCachedBranding()
  const company = await getCachedCompany(claims.sub)

  if (!company) {
    redirect('/onboarding')
  }

  const [branding, adminRow, billingRow] = await Promise.all([
    brandingPromise, // already in flight
    requireServiceClient()
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', claims.sub)
      .maybeSingle(),
    // Inline trial check — getCachedCompany (AppCompany) doesn't include tier columns
    requireServiceClient()
      .from('companies')
      .select('tier, tier_trial_ends_at')
      .eq('user_id', claims.sub)
      .single(),
  ])
  const isAdmin = !!adminRow.data

  const trialDaysRemaining =
    billingRow.data?.tier === 'free' && billingRow.data?.tier_trial_ends_at
      ? Math.ceil(
          (new Date(billingRow.data.tier_trial_ends_at).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      : null

  return (
    <TourProvider>
      <div className="flex h-screen">
        <Sidebar
          branding={{
            appName: branding.appName,
            logoUrl: branding.logoUrl,
          }}
          company={company}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar company={company} isAdmin={isAdmin} />
          <MobileHeader />
          {trialDaysRemaining !== null && trialDaysRemaining < 3 && (
            <TrialBanner daysRemaining={trialDaysRemaining} />
          )}
          <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
            {children}
          </main>
        </div>
        <BottomNav />
        <TranslationLoadingOverlay />
        <UpgradeModal />
        <WelcomeModal />
        <TourSpotlight />
        <TourHelpButton />
      </div>
    </TourProvider>
  )
}
