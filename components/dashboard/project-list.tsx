'use client'

import { useMemo, useState } from 'react'
import type { ProjectWithClient } from '@/lib/queries/dashboard'
import { ProjectActions } from '@/components/dashboard/project-actions'
import { ProjectStatusTabs } from '@/components/projects/project-status-tabs'
import { ProjectTable } from '@/components/projects/project-table'

type StatusFilter = 'all' | 'draft' | 'estimate_ready' | 'sent' | 'paid'

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'estimate_ready', label: 'Estimate ready' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
]

interface ProjectListProps {
  projects: ProjectWithClient[]
}

export function ProjectList({ projects }: ProjectListProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const filteredProjects = useMemo(
    () =>
      statusFilter === 'all'
        ? projects
        : projects.filter((project) => project.status === statusFilter),
    [projects, statusFilter],
  )

  return (
    <ProjectTable<ProjectWithClient>
      projects={filteredProjects}
      title={<h2 className="text-2xl font-semibold tracking-[-0.015em] shrink-0">Recent projects</h2>}
      pageSize={10}
      headerLeft={(
        <>
          <ProjectStatusTabs
            value={statusFilter}
            options={STATUS_OPTIONS}
            onValueChange={setStatusFilter}
          />
          <div className="w-px bg-border self-stretch shrink-0" />
        </>
      )}
      emptyTitle={projects.length === 0 ? undefined : 'No projects match your filters'}
      emptyDescription={projects.length === 0 ? undefined : 'Try another status or clear the search.'}
      emptyActionLabel={projects.length === 0 ? 'New Project' : undefined}
      emptyActionHref={projects.length === 0 ? '/projects/new' : undefined}
      renderActions={(project) => (
        <ProjectActions projectId={project.id} projectName={project.name} />
      )}
    />
  )
}
