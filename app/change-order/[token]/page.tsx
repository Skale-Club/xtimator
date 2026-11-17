import { cache, type CSSProperties } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getChangeOrderByShareToken, recordChangeOrderView } from '@/lib/change-orders/queries'
import { ChangeOrderView } from '@/components/share/change-order-view'
import { isOwnerVisit } from '@/lib/estimates/owner-visit'
import { getBranding } from '@/lib/platform-config'
import { hexToHslTriplet } from '@/lib/color'
import { SYSTEM_COLORS } from '@/lib/system-colors'

interface ChangeOrderPageProps {
  params: Promise<{ token: string }>
}

// One lookup per request for both generateMetadata and the page.
const loadChangeOrder = cache((token: string) => getChangeOrderByShareToken(token))

export async function generateMetadata({ params }: ChangeOrderPageProps): Promise<Metadata> {
  const { token } = await params
  const data = await loadChangeOrder(token)
  if (!data) return { title: { absolute: 'Change order not found' } }
  return {
    title: { absolute: `Change order #${data.changeOrder.number} from ${data.company.name}` },
    description: `Review a change order for ${data.estimate.projectName}`,
  }
}

export default async function ChangeOrderPage({ params }: ChangeOrderPageProps) {
  const { token } = await params
  const data = await loadChangeOrder(token)
  if (!data) notFound()

  // The owner (or a teammate) previewing their own link is not a client view.
  const ownerPreview = await isOwnerVisit(data.company.id)
  if (!ownerPreview) {
    // Fire-and-forget: a failed view count must never block the page.
    recordChangeOrderView(token).catch(() => {})
  }

  const branding = await getBranding()
  const headersList = await headers()
  const isWhiteLabel = headersList.get('x-white-label') === '1'

  const brandTriplet =
    (data.company.brand_primary_color ? hexToHslTriplet(data.company.brand_primary_color) : null) ??
    SYSTEM_COLORS.primaryHsl
  const brandStyle = { ['--platform-primary' as string]: brandTriplet } as CSSProperties

  return (
    <div style={brandStyle} className="relative isolate min-h-screen">
      <main className="mx-auto max-w-4xl px-4 pb-4 pt-0">
        <ChangeOrderView
          data={data}
          token={token}
          appName={branding.appName}
          whiteLabelMode={isWhiteLabel}
          ownerPreview={ownerPreview}
        />
      </main>
    </div>
  )
}
