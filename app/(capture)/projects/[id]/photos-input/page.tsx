import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { getProjectById } from '@/lib/queries/project'
import { PhotosInputClient } from './photos-input-client'

export default async function PhotosInputPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const claims = await getAuthClaims()
  if (!claims) notFound()
  const company = await getActiveCompany()
  if (!company) notFound()

  const supabase = await createClient()
  const project = await getProjectById(supabase, id)
  if (!project) notFound()

  return <PhotosInputClient project={project} companyId={company.id} />
}