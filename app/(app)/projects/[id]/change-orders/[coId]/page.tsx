import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/queries/project'
import { getChangeOrderAction, getContractSummaryAction } from '@/lib/actions/change-order'
import { ChangeOrderEditor } from '@/components/workspace/change-orders/change-order-editor'

/**
 * Owner-side change order page. Renders inside the v2 app shell like the
 * estimate editor: `data-editor-frame="v2"` makes globals.css drop the app
 * header, bottom nav and chat bubble on phones.
 */
export default async function ChangeOrderPage({
  params,
}: {
  params: Promise<{ id: string; coId: string }>
}) {
  const { id, coId } = await params
  const supabase = await createClient()

  const project = await getProjectById(supabase, id)
  if (!project) notFound()

  const changeOrder = await getChangeOrderAction(coId)
  if (changeOrder.error || !changeOrder.data || changeOrder.data.project_id !== project.id) notFound()
  const co = changeOrder.data

  const [contractResult, companyResult] = await Promise.all([
    getContractSummaryAction(co.estimate_id),
    supabase
      .from('companies')
      .select('name, logo_url, phone, digital_signature_enabled, brand_primary_color')
      .eq('id', project.company_id)
      .single(),
  ])
  const company = companyResult.data

  return (
    <div data-editor-frame="v2" className="flex min-h-full flex-col">
      <ChangeOrderEditor
        changeOrder={co}
        contract={contractResult.data ?? null}
        project={{ id: project.id, name: project.name, clientName: project.client?.name ?? null }}
        company={{
          name: (company?.name as string | null) ?? '',
          logo_url: (company?.logo_url as string | null) ?? null,
          phone: (company?.phone as string | null) ?? null,
          digital_signature_enabled: (company?.digital_signature_enabled as boolean | null) ?? false,
          brand_primary_color: (company?.brand_primary_color as string | null) ?? null,
        }}
      />
    </div>
  )
}
