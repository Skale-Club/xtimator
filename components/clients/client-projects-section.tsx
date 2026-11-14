'use client'

import Link from 'next/link'
import { FolderOpen } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { DataTable, type Column } from '@/components/ui/data-table'
import { ProjectStatusBadge } from '@/components/projects/project-status-badge'
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
    // Same glass panel as the header, without backdrop blur (blurred tall
    // panels froze scrolling on phones). New Project lives in the page header.
    <section
      aria-labelledby="client-projects-heading"
      className="min-w-0 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-glass)] sm:p-5"
    >
      <h2 id="client-projects-heading" className="mb-1 flex items-baseline gap-2 text-lg font-semibold tracking-tight">
        {t('Projects')}
        <span className="text-sm font-normal text-muted-foreground tabular-nums">{projects.length}</span>
      </h2>

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
    </section>
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
    // py-0: Card ships py-6, which on top of the inner p-4 made these rows 40px
    // taller than their content.
    <Card className="mb-2 py-0">
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <Link href={`/projects/${project.id}`} className="min-w-0 break-words font-medium hover:underline">
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
