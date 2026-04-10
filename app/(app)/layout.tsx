import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/app-shell/sidebar'
import { Topbar } from '@/components/app-shell/topbar'
import { BottomNav } from '@/components/app-shell/bottom-nav'
import { MobileHeader } from '@/components/app-shell/mobile-header'

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null

  if (!claims) {
    redirect('/auth/login')
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, logo_url, owner_name')
    .eq('user_id', claims.sub)
    .single()

  if (!company) {
    redirect('/onboarding')
  }

  return (
    <div className="flex h-screen">
      <Sidebar company={company} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar company={company} />
        <MobileHeader />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
