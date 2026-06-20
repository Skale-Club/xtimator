import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { AccountSection } from '@/components/settings/account-section'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Account | Settings' }

export default async function AccountTabPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Account</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Update login credentials and manage irreversible account actions.</T>
        </p>
      </header>
      <AccountSection />
    </div>
  )
}
