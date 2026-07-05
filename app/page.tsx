import { Suspense } from 'react'
import { getBranding } from '@/lib/platform-config'
import { LandingPage } from '@/components/landing/landing-page'
import { createClient } from '@/lib/supabase/server'
import { JsonLd } from '@/components/seo/json-ld'
import {
  organizationSchema,
  softwareApplicationSchema,
  websiteSchema,
} from '@/lib/seo/structured-data'

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
    <>
      <JsonLd
        data={[
          organizationSchema({
            name: branding.appName,
            description: branding.metaDescription ?? landingContent.heroSubheadline,
            logoUrl: branding.logoUrl,
          }),
          websiteSchema(branding.appName),
          softwareApplicationSchema({
            name: branding.appName,
            description: branding.metaDescription ?? landingContent.heroSubheadline,
          }),
        ]}
      />
      <Suspense fallback={null}>
        <LandingPage
          content={landingContent}
          branding={{ appName: branding.appName, logoUrl: branding.logoUrl }}
          navUser={navUser}
        />
      </Suspense>
    </>
  )
}
