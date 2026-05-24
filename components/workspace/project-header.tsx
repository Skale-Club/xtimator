import { getCurrentEstimate } from '@/lib/queries/estimate'
import { ProjectTitle } from '@/components/workspace/project-title'
import { AIInputGroup } from '@/components/workspace/ai-input-group/ai-input-group'
import type { ProjectDetail } from '@/lib/queries/project'
import type { SupabaseClient } from '@supabase/supabase-js'

interface ProjectHeaderProps {
  project: ProjectDetail
  supabase: SupabaseClient
}

export async function ProjectHeader({ project, supabase }: ProjectHeaderProps) {
  const currentEstimate = await getCurrentEstimate(supabase, project.id)

  return (
    <header className="px-4 pb-4 pt-6 md:px-6">
      <div className="flex items-start justify-between gap-4">
        <ProjectTitle projectId={project.id} initialName={project.name} />
        <AIInputGroup
          projectId={project.id}
          companyId={project.company_id}
          currentEstimate={currentEstimate}
        />
      </div>
      {project.client && (
        <p className="mt-1 text-sm text-muted-foreground">{project.client.name}</p>
      )}
    </header>
  )
}
