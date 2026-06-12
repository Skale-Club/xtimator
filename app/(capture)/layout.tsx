import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'

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
