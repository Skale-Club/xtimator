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
  const branding = await getBranding()
  const landingContent = branding.landingContent

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
      <Suspense
        fallback={
          <div
            aria-hidden
            className="min-h-screen bg-background bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,hsl(var(--primary)/0.15),hsl(var(--foreground)/0))]"
          />
        }
      >
        <LandingPage
          content={landingContent}
          branding={{ appName: branding.appName, logoUrl: branding.logoUrl }}
        />
      </Suspense>
    </>
  )
}
