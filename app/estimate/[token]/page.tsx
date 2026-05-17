import type { CSSProperties } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getEstimateByShareToken } from '@/lib/queries/share'
import { logEstimateView } from './actions'
import { EstimateView } from '@/components/share/estimate-view'
import { getBranding } from '@/lib/platform-config'
import { hexToHslTriplet } from '@/lib/color'
import { SYSTEM_COLORS } from '@/lib/system-colors'

interface SharePageProps {
  params: Promise<{ token: string }>
  searchParams: Promise<{ stripe?: string }>
}

export async function generateMetadata({
  params,
}: SharePageProps): Promise<Metadata> {
  const { token } = await params
  const data = await getEstimateByShareToken(token)

  if (!data) {
    return { title: 'Estimate Not Found' }
  }

  return {
    title: `Estimate from ${data.estimate.company.name}`,
    description: `View estimate for ${data.estimate.project.name}`,
  }
}

export default async function SharePage({ params, searchParams }: SharePageProps) {
  const { token } = await params
  const sp = await searchParams
  const data = await getEstimateByShareToken(token)

  if (!data) {
    notFound()
  }

  // Log the view event (fire-and-forget, don't block render)
  logEstimateView(token).catch(() => {
    // Silently ignore view logging failures
  })

  const alreadyResponded = !!data.estimate.client_response
  const branding = await getBranding()
  const headersList = await headers()
  const isWhiteLabel = headersList.get('x-white-label') === '1'

  // Phase 70 — Stripe Connect payment return state. The URL is the source of
  // truth for the banner; the DB payment_status is updated by the webhook
  // (Plan 70-04) which may land a few seconds after this redirect.
  const stripeState: 'success' | 'canceled' | null =
    sp.stripe === 'success'
      ? 'success'
      : sp.stripe === 'canceled'
        ? 'canceled'
        : null

  // Phase 71-09: inject tenant brand color as --platform-primary so the
  // forced-light scope cascades it into --primary, which gradient-brand +
  // gradient-hero consume via hsl(var(--primary)). RESEARCH G6 + G7.
  const tenantBrandHex = data.estimate.company.brand_primary_color
  const tenantBrandTriplet =
    (tenantBrandHex ? hexToHslTriplet(tenantBrandHex) : null) ??
    SYSTEM_COLORS.primaryHsl
  const brandStyle = {
    ['--platform-primary' as string]: tenantBrandTriplet,
  } as CSSProperties

  return (
    <div style={brandStyle} className="relative isolate min-h-screen">
      {/* Hero radial backdrop — re-tints with tenant --platform-primary */}
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[420px] gradient-hero" />
      <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <EstimateView
          estimate={data.estimate}
          client={data.client}
          token={token}
          alreadyResponded={alreadyResponded}
          appName={branding.appName}
          whiteLabelMode={isWhiteLabel}
          stripeState={stripeState}
        />
      </main>
    </div>
  )
}
