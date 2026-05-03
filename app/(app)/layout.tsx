import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectsByCompany } from '@/lib/queries/project'
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
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null

  if (!claims) {
    redirect('/login')
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, logo_url, owner_name, theme_preference')
    .eq('user_id', claims.sub)
    .single()

  if (!company) {
    redirect('/onboarding')
  }

  const { projects, hasMore } = await getProjectsByCompany(supabase, company.id, 1, 10)

  return (
    <div className="flex h-screen">
      <Sidebar company={company} projects={projects} hasMore={hasMore} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar company={company} />
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
