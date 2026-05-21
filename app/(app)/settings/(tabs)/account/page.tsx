import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { AccountSection } from '@/components/settings/account-section'

export const metadata = { title: 'Account | Settings' }

export default async function AccountTabPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')
  return <AccountSection />
}
