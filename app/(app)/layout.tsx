import { redirect } from 'next/navigation'
import { getBranding } from '@/lib/platform-config'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { requireServiceClient } from '@/lib/supabase/service'
import { Sidebar } from '@/components/app-shell/sidebar'
import { Topbar } from '@/components/app-shell/topbar'
import { BottomNav } from '@/components/app-shell/bottom-nav'
import { MobileHeader } from '@/components/app-shell/mobile-header'
import { TranslationLoadingOverlay } from '@/components/i18n/translation-loading-overlay'

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const claims = await getAuthClaims()

  if (!claims) {
    redirect('/login')
  }

  const company = await getCachedCompany(claims.sub)

  if (!company) {
    redirect('/onboarding')
  }

  const [branding, adminRow] = await Promise.all([
    getBranding(),
    requireServiceClient()
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', claims.sub)
      .maybeSingle(),
  ])
  const isAdmin = !!adminRow.data

  return (
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
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>
      <BottomNav />
      <TranslationLoadingOverlay />
    </div>
  )
}
