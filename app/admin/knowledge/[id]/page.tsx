import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { EditEntryWrapper } from './edit-entry-wrapper'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

export const dynamic = 'force-dynamic'

type KnowledgeEntryRow = {
  id: string
  industry_id: string
  title: string
  body: string
  source: string | null
}

export default async function EditKnowledgeEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const svc = requireServiceClient()
  const { data } = await svc.from('knowledge_entries').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
        <T>Edit knowledge entry</T>
      </h1>
      <Card variant="glass" className="p-6 md:p-8">
        <EditEntryWrapper entry={data as KnowledgeEntryRow} />
      </Card>
    </div>
  )
}
