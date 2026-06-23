'use client'

import { cn } from '@/lib/utils'
import { ProjectTitle } from '@/components/workspace/project-title'
import type { ProjectDetail } from '@/lib/queries/project'
import { useEstimateVersionSlot } from './estimate-version-context'
import { EditEstimateHeaderButton } from '@/components/workspace/edit-estimate-header-button'

interface ProjectHeaderProps {
  project: ProjectDetail
}

const STATUS_LABEL: Record<string, string> = {
  estimate_ready: 'Estimate ready',
}
const STATUS_DOT: Record<string, string> = {
  estimate_ready: 'bg-green-400',
}

export function ProjectHeader({ project }: ProjectHeaderProps) {
  const { slot } = useEstimateVersionSlot()

  const statusLabel = STATUS_LABEL[project.status] ?? 'In progress'
  const statusDot = STATUS_DOT[project.status] ?? 'bg-blue-400'

  return (
    <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm [-webkit-backdrop-filter:blur(4px)] px-4 pb-3 pt-4 md:px-6">
      <div className="flex items-center gap-3 flex-wrap justify-between">
        {/* Left: title */}
        <div className="min-w-0">
          <ProjectTitle
            projectId={project.id}
            initialName={project.name}
            onRenameSuccess={slot?.onProjectRenamed}
          />
        </div>

        {/* Right: Edit-with-AI + status pill — one items-center row so the pill
            is vertically aligned with the button. */}
        <div className="flex items-center gap-2 shrink-0">
          <EditEstimateHeaderButton projectId={project.id} />
          {slot && (
            <div className="flex items-stretch shrink-0 rounded-md border border-border/60 overflow-hidden text-xs bg-muted/10">
              {/* Status */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground font-medium">
                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', statusDot)} />
                {statusLabel}
              </div>
            </div>
          )}
        </div>
      </div>

      {project.client && (
        <p className="mt-1 text-sm text-muted-foreground">{project.client.name}</p>
      )}
    </header>
  )
}
