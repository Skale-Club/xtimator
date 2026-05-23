'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { FolderOpen } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { DataTable, type Column } from '@/components/ui/data-table'
import { ProjectStatusBadge } from '@/components/projects/project-status-badge'
import { formatMoney } from '@/lib/money/currency'
import { useTranslation } from '@/lib/i18n/use-translation'

export interface ProjectTableRow {
  id: string
  name: string
  project_type?: string | null
  status: string
  total?: number | null
  currency_code?: unknown
  created_at: string
  client?: { id: string; name: string } | null
  payment_status?: 'unpaid' | 'paid' | 'refunded' | null
  paid_at?: string | null
}

interface ProjectTableProps<TProject extends ProjectTableRow> {
  projects: TProject[]
  renderActions: (project: TProject) => ReactNode
  searchPlaceholder?: string
  statusFilters?: readonly string[]
  defaultStatusFilter?: string
  emptyTitle?: string
  emptyDescription?: string
  emptyActionLabel?: string
  emptyActionHref?: string
  noResultsTitle?: string
  noResultsDescription?: string
  fallbackCurrencyCode?: unknown
  headerRight?: ReactNode
  actionsHeader?: string
}

function ProjectPaidBadge({ project }: { project: ProjectTableRow }) {
  if (project.payment_status !== 'paid') return null

  return (
    <span
      title={project.paid_at ? `Paid ${new Date(project.paid_at).toLocaleDateString()}` : 'Paid'}
      className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
    >
      Paid
    </span>
  )
}

export function ProjectTable<TProject extends ProjectTableRow>({
  projects,
  renderActions,
  searchPlaceholder,
  statusFilters,
  defaultStatusFilter,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  emptyActionHref,
  noResultsTitle,
  noResultsDescription,
  fallbackCurrencyCode,
  headerRight,
  actionsHeader,
}: ProjectTableProps<TProject>) {
  const { t } = useTranslation()

  const columns: Column<TProject>[] = [
    {
      key: 'name',
      header: t('Name'),
      cell: (project) => (
        <>
          <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
            {project.name}
          </Link>
          <ProjectPaidBadge project={project} />
        </>
      ),
    },
    {
      key: 'client',
      header: t('Client'),
      cell: (project) => (
        <span className="text-muted-foreground">{project.client?.name ?? '-'}</span>
      ),
    },
    {
      key: 'type',
      header: t('Type'),
      cell: (project) => <>{project.project_type ?? '-'}</>,
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
        formatMoney(project.total, project.currency_code ?? fallbackCurrencyCode, {
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
    {
      key: 'actions',
      header: actionsHeader ?? t('Actions'),
      className: 'w-[50px]',
      cell: renderActions,
    },
  ]

  return (
    <DataTable<TProject>
      data={projects}
      columns={columns}
      getRowKey={(project) => project.id}
      searchPlaceholder={searchPlaceholder ?? t('Search projects...')}
      searchFn={(project, term) =>
        project.name.toLowerCase().includes(term) ||
        (project.client?.name?.toLowerCase().includes(term) ?? false) ||
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
      filterTabs={statusFilters?.map((status) => ({
        key: status,
        label: status,
        match: status === 'all' ? undefined : (project: TProject) => project.status === status,
      }))}
      defaultFilter={defaultStatusFilter}
      emptyTitle={emptyTitle ?? t('No projects yet')}
      emptyDescription={emptyDescription ?? t('Create your first project to get started')}
      emptyActionLabel={emptyActionLabel}
      emptyActionHref={emptyActionHref}
      noResultsTitle={noResultsTitle ?? t('No projects match your search')}
      noResultsDescription={noResultsDescription ?? ''}
      emptyIcon={FolderOpen}
      headerRight={headerRight}
      renderMobileCard={(project) => (
        <ProjectTableCard
          key={project.id}
          project={project}
          renderActions={renderActions}
          fallbackCurrencyCode={fallbackCurrencyCode}
        />
      )}
    />
  )
}

function ProjectTableCard<TProject extends ProjectTableRow>({
  project,
  renderActions,
  fallbackCurrencyCode,
}: {
  project: TProject
  renderActions: (project: TProject) => ReactNode
  fallbackCurrencyCode?: unknown
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
              {project.name}
            </Link>
            <ProjectPaidBadge project={project} />
          </div>
          <div className="shrink-0">{renderActions(project)}</div>
        </div>
        <div className="mb-3 space-y-1 text-sm text-muted-foreground">
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
        <div className="flex items-center justify-between gap-3">
          <ProjectStatusBadge status={project.status} />
          <span className="font-semibold">
            {formatMoney(project.total, project.currency_code ?? fallbackCurrencyCode, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
