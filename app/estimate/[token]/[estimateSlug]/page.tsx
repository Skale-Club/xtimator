import type { CSSProperties } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getEstimateByPublicToken, getShareLinkStateByPublicToken } from '@/lib/queries/share'
import { parsePublicSlugParam } from '@/lib/estimate/public-url'
import { logEstimateView } from '@/app/estimate/[token]/actions'
import { EstimateView } from '@/components/share/estimate-view'
import { getBranding } from '@/lib/platform-config'
import { hexToHslTriplet } from '@/lib/color'
import { SYSTEM_COLORS } from '@/lib/system-colors'

interface FriendlySharePageProps {
  // The first URL segment carries the COMPANY SLUG, but the param key is
  // `token` — Next.js requires every dynamic segment at the same path
  // position to share one name, and the legacy share route owns
  // `app/estimate/[token]`. Two sibling names ([token] vs [companySlug])
  // pass `next build` but crash the router on EVERY runtime request
  // ("You cannot use different slug names for the same dynamic path"),
  // which took prod down. The value is cosmetic here: this page resolves
  // the estimate purely from the short token inside `estimateSlug`.
  params: Promise<{ token: string; estimateSlug: string }>
}

export async function generateMetadata({
  params,
}: FriendlySharePageProps): Promise<Metadata> {
  const { estimateSlug } = await params
  const parsed = parsePublicSlugParam(estimateSlug)
  if (!parsed) return { title: 'Estimate Not Found' }

  const data = await getEstimateByPublicToken(parsed.shortToken)
  if (!data) return { title: 'Estimate Not Found' }

  return {
    title: `Estimate from ${data.estimate.company.name}`,
    description: `View estimate for ${data.estimate.project.name}`,
  }
}

export default async function FriendlySharePage({ params }: FriendlySharePageProps) {
  const { estimateSlug } = await params
  const parsed = parsePublicSlugParam(estimateSlug)
  if (!parsed) notFound()

  const data = await getEstimateByPublicToken(parsed.shortToken)

  if (!data) {
    // Distinguish an expired link from a genuinely missing one, mirroring
    // app/estimate/[token]/page.tsx's exact behavior (PUBURL-02/05 parity).
    const linkState = await getShareLinkStateByPublicToken(parsed.shortToken)
    if (linkState === 'expired') {
      return (
        <main className="max-w-lg mx-auto px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">This estimate link has expired</h1>
          <p className="mt-3 text-muted-foreground">
            For your security, estimate links expire after a period of inactivity. Please ask the
            sender to re-send the estimate — that will give you a fresh, working link.
          </p>
        </main>
      )
    }
    notFound()
  }

  // Fire-and-forget view log — keyed off the estimate's REAL share_token
  // (PUBURL-05), never the shortToken used to reach this page. Reuses the
  // SAME action app/estimate/[token]/page.tsx uses — no parallel logging path.
  logEstimateView(data.realShareToken).catch(() => {
    // Silently ignore view logging failures
  })

  const alreadyResponded = !!data.estimate.client_response
  const branding = await getBranding()
  const headersList = await headers()
  // PUBURL-06: the x-white-label custom-domain header has NO live producer
  // anywhere in the current request pipeline (proxy.ts/next.config.ts —
  // confirmed dead by direct verification, see 160-RESEARCH.md's
  // "Custom-domain verification finding"). Read here anyway for exact
  // structural parity with app/estimate/[token]/page.tsx; this always
  // evaluates false today, identical to that route's actual behavior.
  const isWhiteLabel = headersList.get('x-white-label') === '1'

  const tenantBrandHex = data.estimate.company.brand_primary_color
  const tenantBrandTriplet =
    (tenantBrandHex ? hexToHslTriplet(tenantBrandHex) : null) ?? SYSTEM_COLORS.primaryHsl
  const brandStyle = {
    ['--platform-primary' as string]: tenantBrandTriplet,
  } as CSSProperties

  return (
    <div style={brandStyle} className="relative isolate min-h-screen">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[420px] gradient-hero" />
      <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <EstimateView
          estimate={data.estimate}
          client={data.client}
          token={data.realShareToken}
          alreadyResponded={alreadyResponded}
          appName={branding.appName}
          whiteLabelMode={isWhiteLabel}
        />
      </main>
    </div>
  )
}
