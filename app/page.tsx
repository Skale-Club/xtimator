import { Suspense } from 'react'
import { getBranding } from '@/lib/platform-config'
import { LandingPage } from '@/components/landing/landing-page'
import { JsonLd } from '@/components/seo/json-ld'
import { absoluteAssetUrl } from '@/lib/storage/asset-url'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'
import {
  organizationSchema,
  softwareApplicationSchema,
  websiteSchema,
} from '@/lib/seo/structured-data'

// Landing media is admin-managed in Supabase. The Docker build intentionally
// has no service-role secret, so prerendering here bakes the media-free fallback
// into the image and serves it for the ISR window after every deployment.
export const dynamic = 'force-dynamic'

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
            // Phase 190 (URL-03): schema.org consumers do not resolve relative URLs
            // against the page, so the org logo must be absolute even though the page
            // itself renders the same value same-origin (see the <LandingPage> branding
            // prop below, which deliberately keeps the raw path). OpenGraph/Twitter need
            // no equivalent — app/layout.tsx sets metadataBase and Next absolutizes
            // metadata images against it.
            // Wrapped at the CALL SITE, not inside organizationSchema(): that shaper is
            // pure and has other potential callers, so fixing the one caller that feeds
            // it a storage URL is the narrower change.
            logoUrl: absoluteAssetUrl(branding.logoUrl, getCanonicalBaseUrl()),
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
