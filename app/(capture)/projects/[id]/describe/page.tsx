import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { getProjectById } from '@/lib/queries/project'
import { DescribeClient } from './describe-client'

export default async function DescribePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const claims = await getAuthClaims()
  if (!claims) notFound()
  const company = await getCachedCompany(claims.sub)
  if (!company) notFound()

  const supabase = await createClient()
  const project = await getProjectById(supabase, id)
  if (!project) notFound()

  return <DescribeClient project={project} companyId={company.id} />
}
