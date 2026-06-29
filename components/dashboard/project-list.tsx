'use client'

import type { ProjectWithClient } from '@/lib/queries/dashboard'
import { ProjectActions } from '@/components/dashboard/project-actions'
import { ProjectTable } from '@/components/projects/project-table'

interface ProjectListProps {
  projects: ProjectWithClient[]
}

export function ProjectList({ projects }: ProjectListProps) {
  return (
    <ProjectTable<ProjectWithClient>
      projects={projects}
      title={<h2 className="text-2xl font-semibold tracking-[-0.015em] shrink-0">Recent projects</h2>}
      pageSize={10}
      emptyActionLabel="New Project"
      emptyActionHref="/projects/new"
      renderActions={(project) => (
        <ProjectActions projectId={project.id} projectName={project.name} />
      )}
    />
  )
}
