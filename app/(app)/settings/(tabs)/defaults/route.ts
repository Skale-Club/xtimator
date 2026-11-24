import { isDemoCompany } from '@/lib/demo/config'
import { getActiveCompanyId } from '@/lib/queries/active-company'

export async function GET() {
  const companyId = await getActiveCompanyId()
  const location = isDemoCompany(companyId) ? '/settings/company' : '/settings/estimates'
  return new Response(null, {
    status: 307,
    headers: { Location: location, 'Cache-Control': 'private, no-store' },
  })
}
