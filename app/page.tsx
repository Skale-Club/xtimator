import { Suspense } from 'react'
import { getBranding } from '@/lib/platform-config'
import { LandingPage } from '@/components/landing/landing-page'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const [branding, landingContent, supabase] = await Promise.all([
    getBranding(),
    import('@/lib/platform-config').then((m) => m.getLandingContent()),
    createClient(),
  ])

  const { data: { user } } = await supabase.auth.getUser()

  const navUser = user
    ? {
        email: user.email ?? '',
        avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
      }
    : null

  return (
    <Suspense fallback={null}>
      <LandingPage
        content={landingContent}
        branding={{ appName: branding.appName, logoUrl: branding.logoUrl }}
        navUser={navUser}
      />
    </Suspense>
  )
}
