'use client'

import { Lock, CircleDot, ChevronDown, Check } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { ProjectTitle } from '@/components/workspace/project-title'
import type { ProjectDetail } from '@/lib/queries/project'
import { useEstimateVersionSlot } from './estimate-version-context'

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

        {/* Right: unified segmented pill */}
        {slot && (
          <div className="flex items-stretch shrink-0 rounded-md border border-border/60 divide-x divide-border/60 overflow-hidden text-xs bg-muted/10">
            {/* Status */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground font-medium">
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', statusDot)} />
              {statusLabel}
            </div>

            {/* Version selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/30 transition-colors focus:outline-none">
                  {slot.versions.find((v) => v.id === slot.currentVersionId)
                    ? `Version ${slot.versions.find((v) => v.id === slot.currentVersionId)!.version}${slot.versions.find((v) => v.id === slot.currentVersionId)!.is_current ? ' (Current)' : ''}`
                    : 'Version'}
                  <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                  {slot.isDirty && !slot.isReadOnly && (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" title="Unsaved changes" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }} className="text-xs">
                {slot.versions.map((v) => (
                  <DropdownMenuItem
                    key={v.id}
                    className="text-xs gap-2"
                    onSelect={() => slot.onVersionChange(v.id)}
                  >
                    <Check className={cn('h-3 w-3 shrink-0', v.id === slot.currentVersionId ? 'opacity-100' : 'opacity-0')} />
                    Version {v.version}{v.is_current ? ' (Current)' : ''}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Workflow status */}
            <div
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5',
                slot.workflowStatus === 'consolidated'
                  ? 'text-[hsl(var(--success))]'
                  : 'text-muted-foreground'
              )}
            >
              {slot.workflowStatus === 'consolidated' ? (
                <Lock className="h-3 w-3 shrink-0" />
              ) : (
                <CircleDot className="h-3 w-3 shrink-0" />
              )}
              {slot.workflowStatus === 'consolidated'
                ? `Consolidated · v${slot.version}`
                : `Draft · v${slot.version}`}
            </div>
          </div>
        )}
      </div>

      {project.client && (
        <p className="mt-1 text-sm text-muted-foreground">{project.client.name}</p>
      )}
    </header>
  )
}
