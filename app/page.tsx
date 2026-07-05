import { Suspense } from 'react'
import { getBranding } from '@/lib/platform-config'
import { LandingPage } from '@/components/landing/landing-page'
import { JsonLd } from '@/components/seo/json-ld'
import {
  organizationSchema,
  softwareApplicationSchema,
  websiteSchema,
} from '@/lib/seo/structured-data'

export const revalidate = 300

export default async function RootPage() {
  const [branding, landingContent] = await Promise.all([
    getBranding(),
    import('@/lib/platform-config').then((m) => m.getLandingContent()),
  ])

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
        />
      </Suspense>
    </>
  )
}
