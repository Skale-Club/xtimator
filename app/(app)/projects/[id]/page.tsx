import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectById, getProjectActivity, getProjectQuickStats } from '@/lib/queries/project'
import { ProjectWorkspace } from '@/components/workspace/project-workspace'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [project, activity, stats] = await Promise.all([
    getProjectById(supabase, id),
    getProjectActivity(supabase, id),
    getProjectQuickStats(supabase, id),
  ])

  if (!project) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
        {project.client && (
          <p className="text-muted-foreground">{project.client.name}</p>
        )}
      </div>
      <ProjectWorkspace project={project} activity={activity} stats={stats} />
    </div>
  )
}
