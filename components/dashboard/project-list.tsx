'use client'

import Link from 'next/link'
import type { ProjectWithClient } from '@/lib/queries/dashboard'
import { DataTable } from '@/components/ui/data-table'
import type { Column } from '@/components/ui/data-table'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { ProjectActions } from '@/components/dashboard/project-actions'
import { ProjectCard } from '@/components/dashboard/project-card'
import { FolderOpen } from 'lucide-react'
import { formatMoney } from '@/lib/money/currency'
import { useTranslation } from '@/lib/i18n/use-translation'

const STATUS_FILTERS = [
  'all',
  'draft',
  'processing',
  'ready',
  'sent',
  'accepted',
  'declined',
  'archived',
] as const

interface ProjectListProps {
  projects: ProjectWithClient[]
}

export function ProjectList({ projects }: ProjectListProps) {
  const { t } = useTranslation()

  const columns: Column<ProjectWithClient>[] = [
    {
      key: 'name',
      header: t('Name'),
      cell: (p) => (
        <>
          <Link href={`/projects/${p.id}`} className="hover:underline font-medium">
            {p.name}
          </Link>
          {p.payment_status === 'paid' && (
            <span
              title={p.paid_at ? `Paid ${new Date(p.paid_at).toLocaleDateString()}` : 'Paid'}
              className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
            >
              Paid
            </span>
          )}
        </>
      ),
    },
    {
      key: 'client',
      header: t('Client'),
      cell: (p) => (
        <span className="text-muted-foreground">{p.client?.name ?? '—'}</span>
      ),
    },
    {
      key: 'type',
      header: t('Type'),
      cell: (p) => <>{p.project_type ?? '—'}</>,
    },
    {
      key: 'status',
      header: t('Status'),
      cell: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: 'total',
      header: t('Total'),
      cell: (p) =>
        formatMoney(p.total, p.currency_code, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }),
    },
    {
      key: 'date',
      header: t('Date'),
      cell: (p) =>
        new Date(p.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
    },
    {
      key: 'actions',
      header: t('Actions'),
      className: 'w-[50px]',
      cell: (p) => <ProjectActions projectId={p.id} projectName={p.name} />,
    },
  ]

  return (
    <DataTable<ProjectWithClient>
      data={projects}
      columns={columns}
      getRowKey={(p) => p.id}
      searchPlaceholder="Search projects..."
      searchFn={(p, term) =>
        p.name.toLowerCase().includes(term) ||
        (p.client?.name?.toLowerCase().includes(term) ?? false)
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
          sort: (a, b) => b.total - a.total,
        },
        {
          value: 'alphabetical',
          label: t('Alphabetical'),
          sort: (a, b) => a.name.localeCompare(b.name),
        },
      ]}
      defaultSort="newest"
      filterTabs={STATUS_FILTERS.map((status) => ({
        key: status,
        label: status,
        match: status === 'all' ? undefined : (p: ProjectWithClient) => p.status === status,
      }))}
      defaultFilter="all"
      emptyTitle={t('No projects yet')}
      emptyDescription={t('Create your first project to get started')}
      emptyIcon={FolderOpen}
      renderMobileCard={(p) => <ProjectCard key={p.id} project={p} />}
    />
  )
}
