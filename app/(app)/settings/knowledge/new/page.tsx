import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { EntryFormWrapper } from '../entry-form-wrapper'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

export const dynamic = 'force-dynamic'

export default async function NewCompanyKnowledgeEntryPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')
  const company = await getActiveCompany()
  if (!company) redirect('/onboarding')

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
        <T>New knowledge entry</T>
      </h1>
      <Card variant="glass" className="p-6 md:p-8">
        <EntryFormWrapper />
      </Card>
    </div>
  )
}
