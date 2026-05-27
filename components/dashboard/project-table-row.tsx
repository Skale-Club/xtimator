import Link from 'next/link'
import type { ProjectWithClient } from '@/lib/queries/dashboard'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { ProjectActions } from '@/components/dashboard/project-actions'
import { TableCell, TableRow } from '@/components/ui/table'
import { formatMoney } from '@/lib/money/currency'
import { formatDate } from '@/lib/utils/format-date'

interface ProjectTableRowProps {
  project: ProjectWithClient
}

export function ProjectTableRow({ project }: ProjectTableRowProps) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link href={`/projects/${project.id}`} className="hover:underline">
          {project.name}
        </Link>
        {project.payment_status === 'paid' && (
          <span
            title={
              project.paid_at
                ? `Paid ${formatDate(project.paid_at)}`
                : 'Paid'
            }
            className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
          >
            Paid
          </span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {project.client?.name ?? '\u2014'}
      </TableCell>
      <TableCell>{project.project_type ?? '\u2014'}</TableCell>
      <TableCell>
        <StatusBadge status={project.status} />
      </TableCell>
      <TableCell>
        {formatMoney(project.total, project.currency_code, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}
      </TableCell>
      <TableCell>
        {formatDate(project.created_at, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </TableCell>
      <TableCell>
        <ProjectActions projectId={project.id} projectName={project.name} />
      </TableCell>
    </TableRow>
  )
}
