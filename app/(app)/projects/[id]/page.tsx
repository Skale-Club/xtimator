import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectById, getProjectActivity, getProjectQuickStats } from '@/lib/queries/project'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getCurrentEstimate, getProjectEstimates } from '@/lib/queries/estimate'
import { ProjectWorkspace } from '@/components/workspace/project-workspace'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [project, activity, stats, recordings, photos, currentEstimate, allVersions] = await Promise.all([
    getProjectById(supabase, id),
    getProjectActivity(supabase, id),
    getProjectQuickStats(supabase, id),
    getProjectRecordings(supabase, id),
    getProjectPhotos(supabase, id),
    getCurrentEstimate(supabase, id),
    getProjectEstimates(supabase, id),
  ])

  if (!project) {
    notFound()
  }

  // Fetch company name for the Send tab
  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', project.company_id)
    .single()

  const companyName = (company?.name as string) ?? ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
        {project.client && (
          <p className="text-muted-foreground">{project.client.name}</p>
        )}
      </div>
      <ProjectWorkspace
        project={project}
        activity={activity}
        stats={stats}
        recordings={recordings}
        photos={photos}
        currentEstimate={currentEstimate}
        allVersions={allVersions}
        companyName={companyName}
      />
    </div>
  )
}
