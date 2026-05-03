'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { ProjectSummary } from '@/lib/queries/project'

const STATUS_DOT: Record<string, string> = {
  draft:           'bg-muted-foreground',
  in_progress:     'bg-blue-500',
  estimate_ready:  'bg-amber-500',
  sent:            'bg-green-500',
  completed:       'bg-green-700',
}

interface SidebarProjectItemProps {
  project: ProjectSummary
  isActive: boolean
}

export function SidebarProjectItem({ project, isActive }: SidebarProjectItemProps) {
  const dotClass = STATUS_DOT[project.status] ?? 'bg-muted-foreground'

  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn(
        'flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-1.5 text-sm transition-colors duration-150',
        isActive
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <span className={cn('h-2 w-2 rounded-full shrink-0', dotClass)} />
      <span className="truncate flex-1">{project.name}</span>
    </Link>
  )
}
