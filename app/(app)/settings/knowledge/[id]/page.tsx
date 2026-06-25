import { notFound, redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { createClient } from '@/lib/supabase/server'
import { EditEntryWrapper } from './edit-entry-wrapper'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

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
    <div className="space-y-8 p-6">
      <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
        <T>Edit knowledge entry</T>
      </h1>
      <Card variant="glass" className="p-6 md:p-8">
        <EditEntryWrapper entry={data as OverlayEntryRow} />
      </Card>
    </div>
  )
}
