import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { getPaywallContext } from '@/lib/billing/access-guard'
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

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {paywall.state === 'active' ? (
        children
      ) : (
        <CaptureBlocked state={paywall.state} priceLabel={paywall.priceLabel} />
      )}
    </div>
  )
}
