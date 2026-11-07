'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { ProjectWithClient } from '@/lib/queries/dashboard'
import { ProjectActions } from '@/components/dashboard/project-actions'
import { ProjectTable } from '@/components/projects/project-table'
import { T } from '@/components/i18n/t'

// The status tabs live inside the table (one owner for every filter), so
// "Clear filters" resets the tab together with the search.
const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'estimate_ready', label: 'Estimate ready' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
] as const

interface ProjectListProps {
  projects: ProjectWithClient[]
}

export function ProjectList({ projects }: ProjectListProps) {
  return (
    <ProjectTable<ProjectWithClient>
      projects={projects}
      title={<h2 className="text-xl font-semibold tracking-[-0.015em] sm:text-2xl"><T>Recent projects</T></h2>}
      headerRight={projects.length > 0 ? (
        <Link href="/projects" className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10">
          <T>View all</T>
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : undefined}
      pageSize={10}
      statusTabs={STATUS_TABS}
      emptyActionLabel="New Project"
      emptyActionHref="/projects/new"
      renderActions={(project) => (
        <ProjectActions projectId={project.id} projectName={project.name} />
      )}
    />
  )
}
