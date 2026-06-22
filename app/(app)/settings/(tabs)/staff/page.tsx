import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { listStaffMembers } from '@/lib/actions/staff'
import { StaffSection } from '@/components/settings/staff-section'

export const metadata = { title: 'Staff | Settings' }

export default async function StaffTabPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const { staff } = await listStaffMembers()

  return <StaffSection staff={staff} />
}
