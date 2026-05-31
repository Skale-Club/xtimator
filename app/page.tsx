import { Suspense } from 'react'
import { getBranding } from '@/lib/platform-config'
import { LandingPage } from '@/components/landing/landing-page'

export default async function RootPage() {
  const [branding, landingContent] = await Promise.all([
    getBranding(),
    import('@/lib/platform-config').then((m) => m.getLandingContent()),
  ])
  return (
    <Suspense fallback={null}>
      <LandingPage
        content={landingContent}
        branding={{ appName: branding.appName, logoUrl: branding.logoUrl }}
      />
    </Suspense>
  )
}
