import { notFound, redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { isDemoCompany } from '@/lib/demo/config'
import { isAcademyAvailable } from '@/lib/academy/catalog'

export const dynamic = 'force-dynamic'

/**
 * Academy gate. /academy exists only when at least one course is visible for
 * this app (Published + Apps contains Xtimator + >=1 Published lesson) and the
 * session is not the read-only demo. Anything else is a plain 404 - no empty
 * state, no "coming soon".
 */
export default async function AcademyLayout({ children }: { children: React.ReactNode }) {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const companyId = await getActiveCompanyId()
  if (companyId && isDemoCompany(companyId)) notFound()

  if (!(await isAcademyAvailable())) notFound()

  return <div className="w-full p-4 md:p-6">{children}</div>
}
