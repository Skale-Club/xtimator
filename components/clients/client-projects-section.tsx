'use client'

import Link from 'next/link'
import { FolderOpen } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { DataTable, type Column } from '@/components/ui/data-table'
import { ProjectStatusBadge } from '@/components/projects/project-status-badge'
import { ClientNewProjectButton } from '@/components/clients/client-new-project-button'
import { formatMoney } from '@/lib/money/currency'
import { useTranslation } from '@/lib/i18n/use-translation'

export interface ClientProjectRow {
  id: string
  name: string
  project_type?: string | null
  status: string
  total?: number | null
  created_at: string
}

interface ClientProjectsSectionProps {
  clientId: string
  clientName: string
  projects: ClientProjectRow[]
  currencyCode: string
}

export function ClientProjectsSection({
  clientId,
  clientName,
  projects,
  currencyCode,
}: ClientProjectsSectionProps) {
  const { t } = useTranslation()

  const columns: Column<ClientProjectRow>[] = [
    {
      key: 'name',
      header: t('Name'),
      className: 'pl-4',
      cell: (project) => (
        <div className="relative -m-3 -ml-4 flex items-center p-3 pl-4">
          <Link
            href={`/projects/${project.id}`}
            className="absolute inset-0"
            aria-hidden="true"
            tabIndex={-1}
          />
          <span className="font-medium hover:underline">{project.name}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: t('Type'),
      cell: (project) => <>{project.project_type ?? '---'}</>,
    },
    {
      key: 'status',
      header: t('Status'),
      cell: (project) => <ProjectStatusBadge status={project.status} />,
    },
    {
      key: 'total',
      header: t('Total'),
      cell: (project) =>
        formatMoney(project.total, currencyCode, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }),
    },
    {
      key: 'date',
      header: t('Date'),
      cell: (project) =>
        new Date(project.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
    },
  ]

  return (
    <Card variant="glass" className="p-6">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">{t('Projects')}</h2>
          <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
            {projects.length}
          </span>
        </div>
        <ClientNewProjectButton clientId={clientId} clientName={clientName} />
      </div>

      <DataTable<ClientProjectRow>
        data={projects}
        columns={columns}
        getRowKey={(project) => project.id}
        searchPlaceholder={t('Search projects...')}
        searchFn={(project, term) =>
          project.name.toLowerCase().includes(term) ||
          (project.project_type?.toLowerCase().includes(term) ?? false)
        }
        sortOptions={[
          {
            value: 'newest',
            label: t('Newest'),
            sort: (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          },
          {
            value: 'oldest',
            label: t('Oldest'),
            sort: (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          },
          {
            value: 'highest',
            label: t('Highest Value'),
            sort: (a, b) => (b.total ?? 0) - (a.total ?? 0),
          },
          {
            value: 'alphabetical',
            label: t('Alphabetical'),
            sort: (a, b) => a.name.localeCompare(b.name),
          },
        ]}
        defaultSort="newest"
        emptyTitle={t('No projects yet')}
        emptyDescription={t('This client has no projects')}
        emptyActionLabel={t('Create project')}
        emptyActionHref={`/projects/new?client=${clientId}`}
        noResultsTitle={t('No projects match your search')}
        emptyIcon={FolderOpen}
        renderMobileCard={(project) => (
          <ClientProjectCard key={project.id} project={project} currencyCode={currencyCode} />
        )}
      />
    </Card>
  )
}

function ClientProjectCard({
  project,
  currencyCode,
}: {
  project: ClientProjectRow
  currencyCode: string
}) {
  return (
    <Card>
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
            {project.name}
          </Link>
        </div>
        <div className="mb-3 space-y-1 text-sm text-muted-foreground">
          {project.project_type && <p>{project.project_type}</p>}
          <p>
            {new Date(project.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <ProjectStatusBadge status={project.status} />
          <span className="font-semibold">
            {formatMoney(project.total, currencyCode, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </span>
        </div>
      </div>
    </Card>
  )
}
