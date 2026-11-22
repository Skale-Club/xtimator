import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/queries/project'
import { getChangeOrderAction, getContractSummaryAction } from '@/lib/actions/change-order'
import { ChangeOrderEditor } from '@/components/workspace/change-orders/change-order-editor'
import { COMPANY_FEATURE_COLUMNS, resolveCompanyFeatures, resolveDigitalSignature } from '@/lib/features/company-features'
import { getPlatformFeatureState } from '@/lib/features/platform-feature-state'
import { loadChangeOrderInvoice } from '@/lib/change-orders/queries'

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

  const [contractResult, companyResult, invoice] = await Promise.all([
    getContractSummaryAction(co.estimate_id),
    supabase
      .from('companies')
      .select(`name, logo_url, phone, brand_primary_color, ${COMPANY_FEATURE_COLUMNS}`)
      .eq('id', project.company_id)
      .single(),
    // Session client: RLS scopes the invoice read to the caller's company.
    loadChangeOrderInvoice(supabase, co.id),
  ])
  const company = companyResult.data
  const platformState = await getPlatformFeatureState()

  return (
    <div data-editor-frame="v2" className="flex min-h-full flex-col">
      <ChangeOrderEditor
        changeOrder={co}
        contract={contractResult.data ?? null}
        invoicing={{
          paymentsEnabled: resolveCompanyFeatures(company, platformState).onlinePayments.canIssue,
          invoice,
        }}
        project={{ id: project.id, name: project.name, clientName: project.client?.name ?? null }}
        company={{
          name: (company?.name as string | null) ?? '',
          logo_url: (company?.logo_url as string | null) ?? null,
          phone: (company?.phone as string | null) ?? null,
          // EFFECTIVE value (platform allowed AND tenant enabled).
          digital_signature_enabled: resolveDigitalSignature(company).active,
          brand_primary_color: (company?.brand_primary_color as string | null) ?? null,
        }}
      />
    </div>
  )
}
