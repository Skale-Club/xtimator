'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { FolderOpen, Pencil } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/data-table'
import { ClientSheet } from '@/components/clients/client-sheet'
import { ClientPicker } from '@/components/clients/client-picker'
import { formatMoney } from '@/lib/money/currency'
import { formatDate } from '@/lib/utils/format-date'
import { useTranslation } from '@/lib/i18n/use-translation'
import { createClient } from '@/lib/supabase/client'
import { linkProjectToClient } from '@/lib/actions/project'
import type { ClientDetail } from '@/lib/queries/clients'

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
  headerLeft?: ReactNode
  title?: ReactNode
  pageSize?: number
  actionsHeader?: string
  companyId?: string
}

function ProjectClientCell({
  projectId,
  client,
  companyId,
  onEditClient,
  onCreateNew,
}: {
  projectId: string
  client: { id: string; name: string } | null | undefined
  companyId?: string
  onEditClient?: (clientId: string) => void
  onCreateNew?: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <ClientPicker
        projectId={projectId}
        currentClientId={client?.id ?? null}
        clientName={client?.name ?? null}
        variant="cell"
        align="start"
        onCreateNew={onCreateNew}
      />
      {client && companyId && onEditClient && (
        <button
          onClick={(e) => { e.stopPropagation(); onEditClient(client.id) }}
          className="inline-flex items-center justify-center rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Edit client"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

function ProjectPaidBadge({ project }: { project: ProjectTableRow }) {
  if (project.payment_status !== 'paid') return null

  return (
    <span
      title={project.paid_at ? `Paid ${formatDate(project.paid_at)}` : 'Paid'}
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
  headerLeft,
  title,
  pageSize,
  actionsHeader,
  companyId,
}: ProjectTableProps<TProject>) {
  const { t } = useTranslation()
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientDetail | null>(null)
  const [createClientForProjectId, setCreateClientForProjectId] = useState<string | null>(null)

  async function handleEditClient(clientId: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()
    if (data) {
      setEditingClient({ ...data, project_count: 0 })
      setSheetOpen(true)
    }
  }

  function handleSheetChange(open: boolean) {
    setSheetOpen(open)
    if (!open) {
      setEditingClient(null)
    }
  }

  const columns: Column<TProject>[] = [
    {
      key: 'name',
      header: t('Name'),
      className: 'pl-4',
      sortDesc: 'z-a',
      sortAsc: 'alphabetical',
      cell: (project) => (
        <div className="relative -m-3 -ml-4 flex items-center p-3 pl-4">
          <Link
            href={`/projects/${project.id}`}
            className="absolute inset-0"
            aria-hidden="true"
            tabIndex={-1}
          />
          <span className="font-medium hover:underline">{project.name}</span>
          <ProjectPaidBadge project={project} />
        </div>
      ),
    },
    {
      key: 'client',
      header: t('Client'),
      cell: (project) => (
        <ProjectClientCell
          projectId={project.id}
          client={project.client}
          companyId={companyId}
          onEditClient={companyId ? handleEditClient : undefined}
          onCreateNew={companyId ? () => setCreateClientForProjectId(project.id) : undefined}
        />
      ),
    },
    {
      key: 'total',
      header: t('Total'),
      sortDesc: 'highest',
      sortAsc: 'lowest',
      cell: (project) =>
        formatMoney(project.total, project.currency_code ?? fallbackCurrencyCode, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }),
    },
    {
      key: 'date',
      header: t('Date'),
      sortDesc: 'newest',
      sortAsc: 'oldest',
      cell: (project) =>
        formatDate(project.created_at, {
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
    <>
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
            value: 'lowest',
            label: t('Lowest Value'),
            sort: (a, b) => (a.total ?? 0) - (b.total ?? 0),
          },
          {
            value: 'alphabetical',
            label: t('Alphabetical'),
            sort: (a, b) => a.name.localeCompare(b.name),
          },
          {
            value: 'z-a',
            label: t('Z → A'),
            sort: (a, b) => b.name.localeCompare(a.name),
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
        headerLeft={headerLeft}
        headerRight={headerRight}
        title={title}
        pageSize={pageSize}
        renderMobileCard={(project) => (
          <ProjectTableCard
            key={project.id}
            project={project}
            renderActions={renderActions}
            fallbackCurrencyCode={fallbackCurrencyCode}
            companyId={companyId}
            onEditClient={companyId ? handleEditClient : undefined}
            onCreateNew={companyId ? () => setCreateClientForProjectId(project.id) : undefined}
          />
        )}
      />
      {companyId && (
        <ClientSheet
          open={sheetOpen}
          onOpenChange={handleSheetChange}
          client={editingClient}
          companyId={companyId}
        />
      )}
      {companyId && createClientForProjectId && (
        <ClientSheet
          open
          onOpenChange={(open) => { if (!open) setCreateClientForProjectId(null) }}
          client={null}
          companyId={companyId}
          onCreated={async (clientId) => {
            await linkProjectToClient(createClientForProjectId, clientId)
            setCreateClientForProjectId(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

function ProjectTableCard<TProject extends ProjectTableRow>({
  project,
  renderActions,
  fallbackCurrencyCode,
  companyId,
  onEditClient,
  onCreateNew,
}: {
  project: TProject
  renderActions: (project: TProject) => ReactNode
  fallbackCurrencyCode?: unknown
  companyId?: string
  onEditClient?: (clientId: string) => void
  onCreateNew?: () => void
}) {
  return (
    <div className="relative flex items-center gap-3 border-b border-border/50 py-3 last:border-0">
      <Link href={`/projects/${project.id}`} className="absolute inset-0" aria-hidden tabIndex={-1} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium truncate">{project.name}</span>
          <ProjectPaidBadge project={project} />
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {formatDate(project.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <span className="text-muted-foreground/30">·</span>
          {/* z-10 lifts the picker above the card's full-bleed overlay Link */}
          <div className="relative z-10">
            <ProjectClientCell
              projectId={project.id}
              client={project.client}
              companyId={companyId}
              onEditClient={onEditClient}
              onCreateNew={onCreateNew}
            />
          </div>
        </div>
      </div>
      <span className="shrink-0 font-semibold text-sm">
        {formatMoney(project.total, project.currency_code ?? fallbackCurrencyCode, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}
      </span>
      <div className="shrink-0 relative z-10">{renderActions(project)}</div>
    </div>
  )
}
