import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { isDemoCompany } from '@/lib/demo/config'
import { createClient } from '@/lib/supabase/server'
import { EditEntryWrapper } from './edit-entry-wrapper'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'
import { SettingsHeader } from '@/components/settings/settings-ui'

export const dynamic = 'force-dynamic'

type OverlayEntryRow = {
  id: string
  title: string
  body: string
  source: string | null
}

export default async function EditCompanyKnowledgeEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')
  const company = await getActiveCompany()
  if (!company) redirect('/onboarding')
  if (isDemoCompany(company.id)) redirect('/settings/company')

  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('knowledge_entries')
    .select('id, title, body, source')
    .eq('id', id)
    .eq('scope', 'company')
    .eq('company_id', company.id)
    .maybeSingle()
  if (!data) notFound()

  return (
    <div className="space-y-6">
      <Link
        href="/settings/knowledge"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        <T>AI knowledge</T>
      </Link>
      <SettingsHeader title={<T>Edit knowledge entry</T>} />
      <Card variant="glass" className="p-5 sm:p-6">
        <EditEntryWrapper entry={data as OverlayEntryRow} />
      </Card>
    </div>
  )
}
