import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getEstimateByShareToken } from '@/lib/queries/share'
import { logEstimateView } from './actions'
import { EstimateView } from '@/components/share/estimate-view'
import { getBranding } from '@/lib/platform-config'

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

  return (
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
  )
}
