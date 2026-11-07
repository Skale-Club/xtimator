import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { isDemoCompany } from '@/lib/demo/config'
import { EntryFormWrapper } from '../entry-form-wrapper'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'
import { SettingsHeader } from '@/components/settings/settings-ui'

export const dynamic = 'force-dynamic'

export default async function NewCompanyKnowledgeEntryPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')
  const company = await getActiveCompany()
  if (!company) redirect('/onboarding')
  if (isDemoCompany(company.id)) redirect('/settings/company')

  return (
    <div className="space-y-6">
      <Link
        href="/settings/knowledge"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        <T>AI knowledge</T>
      </Link>
      <SettingsHeader title={<T>New knowledge entry</T>} />
      <Card variant="glass" className="p-5 sm:p-6">
        <EntryFormWrapper />
      </Card>
    </div>
  )
}
