'use client'

import type { ProjectWithClient } from '@/lib/queries/dashboard'
import { ProjectActions } from '@/components/dashboard/project-actions'
import { ProjectTable } from '@/components/projects/project-table'

const STATUS_FILTERS = [
  'all',
  'recording',
  'draft',
  'estimate_ready',
] as const

interface ProjectListProps {
  projects: ProjectWithClient[]
}

export function ProjectList({ projects }: ProjectListProps) {
  return (
    <ProjectTable<ProjectWithClient>
      projects={projects}
      defaultStatusFilter="all"
      statusFilters={STATUS_FILTERS}
      emptyActionLabel="New Project"
      emptyActionHref="/projects/new"
      renderActions={(project) => (
        <ProjectActions projectId={project.id} projectName={project.name} />
      )}
    />
  )
}
