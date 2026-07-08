'use client'

import { useMemo } from 'react'
import { ProjectTitle } from '@/components/workspace/project-title'
import type { ProjectDetail } from '@/lib/queries/project'
import { useEstimateVersionSlot } from './estimate-version-context'
import { EditEstimateHeaderButton } from '@/components/workspace/edit-estimate-header-button'
import { useBreadcrumb } from '@/components/app-shell/breadcrumb-context'

interface ProjectHeaderProps {
  project: ProjectDetail
}

export function ProjectHeader({ project }: ProjectHeaderProps) {
  const { slot } = useEstimateVersionSlot()
  const breadcrumbItems = useMemo(
    () => [
      { label: 'Projects', href: '/projects' },
      { label: project.name },
    ],
    [project.name],
  )

  // Feed the global breadcrumb so the top bar (desktop) and mobile header show
  // the project name instead of falling back to the raw project-id URL segment.
  useBreadcrumb(breadcrumbItems)

  return (
    <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm [-webkit-backdrop-filter:blur(4px)] px-5 pb-3 pt-4 md:px-6">
      {/* items-start on mobile so a 2-line wrapped title (ProjectTitle line-clamp-2)
          keeps the action button anchored to the top instead of floating mid-title;
          sm+ stays center-aligned with the single-line title. */}
      <div className="flex items-start sm:items-center gap-3 justify-between">
        {/* Left: title */}
        <div className="min-w-0 flex-1">
          <ProjectTitle
            projectId={project.id}
            initialName={project.name}
            onRenameSuccess={slot?.onProjectRenamed}
          />
        </div>

        {/* Right: Edit-with-AI button */}
        <div className="flex items-center gap-2 shrink-0 pt-0.5 sm:pt-0">
          <EditEstimateHeaderButton projectId={project.id} />
        </div>
      </div>

      {project.client && (
        <p className="mt-1 text-sm text-muted-foreground">{project.client.name}</p>
      )}
    </header>
  )
}
