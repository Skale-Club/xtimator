import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { getPaywallContext } from '@/lib/billing/access-guard'
import { TwaProvider } from '@/components/pwa/twa-provider'
import { isTwaRequest } from '@/lib/pwa/twa-context'
import { CaptureBlocked } from '@/components/billing/capture-blocked'
import type { Metadata } from 'next'
import { PRIVATE_ROBOTS } from '@/lib/seo/route-policy'

export const metadata: Metadata = { robots: PRIVATE_ROBOTS }

export default async function CaptureLayout({ children }: { children: React.ReactNode }) {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')
  const company = await getActiveCompany()
  if (!company) redirect('/onboarding')

  // SEED-055 Phase D: capture is pure creation, so a paywalled / out-of-credits
  // company gets a full-screen block instead of the recording UI.
  const paywall = await getPaywallContext(company.id)
  const isTwa = await isTwaRequest()

  return (
    <TwaProvider isTwa={isTwa}>
    {/* While the phone keyboard is up the surface is exactly the visible area
        (see lib/visual-viewport.ts), so the screen's bottom action and its
        scroll region sit above the keyboard instead of behind it. */}
    <div className="fixed inset-0 z-50 bg-background flex flex-col [html[data-keyboard=open]_&]:bottom-auto [html[data-keyboard=open]_&]:top-[var(--app-vv-top,0px)] [html[data-keyboard=open]_&]:h-[var(--app-vvh,100dvh)]">
      {paywall.state === 'active' ? (
        children
      ) : (
        <CaptureBlocked state={paywall.state} priceLabel={isTwa ? '' : paywall.priceLabel} />
      )}
    </div>
    </TwaProvider>
  )
}
