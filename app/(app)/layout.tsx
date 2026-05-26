import { redirect } from 'next/navigation'
import { getCachedBranding } from '@/lib/platform-config'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany, getActiveCompanyId, getMembershipCompanies } from '@/lib/queries/active-company'
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
import { SWRegister } from '@/components/pwa/sw-register'
import { InstallPrompt } from '@/components/pwa/install-prompt'
import { OfflineIndicator } from '@/components/pwa/offline-indicator'
import { NewProjectDialog } from '@/components/projects/new-project-dialog'
import { EstimateCreationPopup } from '@/components/projects/estimate-creation-popup'
import { BreadcrumbProvider } from '@/components/app-shell/breadcrumb-context'

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const claims = await getAuthClaims()

  if (!claims) {
    redirect('/?auth=login')
  }

  // Start branding immediately — no dependency on company (D-06, D-09)
  const brandingPromise = getCachedBranding()

  // Phase 79 (D-10, D-11): primary company read now flows through the active-company
  // helpers instead of the legacy user-keyed cache. The 1:1 backfill from Phase 79 Plan 01
  // means existing users get the same single company resolved via fallback, so this is a
  // no-op behavioral change for current users.
  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) {
    redirect('/onboarding')
  }

  const company = await getActiveCompany()
  if (!company) {
    redirect('/onboarding')
  }

  const [branding, adminRow, billingRow, memberships] = await Promise.all([
    brandingPromise, // already in flight
    requireServiceClient()
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', claims.sub)
      .maybeSingle(),
    // Phase 79 (D-10): billing row keyed by activeCompanyId. Replaces the prior
    // user-keyed lookup which presumed a 1:1 user→company relationship.
    requireServiceClient()
      .from('companies')
      .select('tier, tier_trial_ends_at')
      .eq('id', activeCompanyId)
      .single(),
    // Phase 81 (SWITCH-13): membership list for the company switcher dropdown.
    // Parallel fetch — no dependency on the prior awaits beyond auth (claims).
    getMembershipCompanies(),
  ])
  const isAdmin = !!adminRow.data

  const trialDaysRemaining =
    billingRow.data?.tier === 'free' && billingRow.data?.tier_trial_ends_at
      ? Math.ceil(
          (new Date(billingRow.data.tier_trial_ends_at).getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null

  return (
    <TourProvider>
      <BreadcrumbProvider>
        <div className="flex h-screen">
          <Sidebar
            branding={{
              appName: branding.appName,
              logoUrl: branding.logoUrl,
            }}
            company={company}
            memberships={memberships}
          />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Topbar company={company} userId={claims.sub as string} isAdmin={isAdmin} />
            <MobileHeader />
            {trialDaysRemaining !== null && trialDaysRemaining < 3 && (
              <TrialBanner daysRemaining={trialDaysRemaining} />
            )}
            <main className="flex-1 overflow-y-auto pb-20 md:pb-6">
              {children}
            </main>
          </div>
          <BottomNav />
          <NewProjectDialog />
          <EstimateCreationPopup />
          <TranslationLoadingOverlay />
          <UpgradeModal />
          <WelcomeModal />
          <TourSpotlight />
          <OfflineIndicator />
          <InstallPrompt />
          <SWRegister />
        </div>
      </BreadcrumbProvider>
    </TourProvider>
  )
}
