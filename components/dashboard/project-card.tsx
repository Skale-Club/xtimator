import Link from 'next/link'
import type { ProjectWithClient } from '@/lib/queries/dashboard'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { ProjectActions } from '@/components/dashboard/project-actions'
import { Card, CardContent } from '@/components/ui/card'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
})

interface ProjectCardProps {
  project: ProjectWithClient
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <Link
            href={`/projects/${project.id}`}
            className="font-medium hover:underline"
          >
            {project.name}
          </Link>
          <ProjectActions projectId={project.id} projectName={project.name} />
        </div>
        <div className="space-y-1 text-sm text-muted-foreground mb-3">
          {project.client?.name && <p>{project.client.name}</p>}
          {project.project_type && <p>{project.project_type}</p>}
          <p>
            {new Date(project.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <StatusBadge status={project.status} />
          <span className="font-semibold">
            {currencyFormatter.format(project.total)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
