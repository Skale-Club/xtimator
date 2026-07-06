import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import type { Metadata } from 'next'
import { PRIVATE_ROBOTS } from '@/lib/seo/route-policy'

export const metadata: Metadata = { robots: PRIVATE_ROBOTS }

export default async function CaptureLayout({ children }: { children: React.ReactNode }) {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')
  const company = await getActiveCompany()
  if (!company) redirect('/onboarding')

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {children}
    </div>
  )
}
